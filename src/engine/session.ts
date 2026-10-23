import { rememberObjects, validateObjectMemory } from './object-memory.ts';
import type { RememberedObject } from './object-memory.ts';
import type { LabelContext } from './labels.ts';
import { createLabelContext } from './labels.ts';
import { buildActionMenu, pageSelection } from './menu.ts';
import type { ActionMenu, MenuPolicy, PagedSelection } from './menu.ts';
import type { LoadedGame } from './bundle-loader.ts';
import { prepareAction } from './action-plan.ts';
import type { GameAction } from './action-plan.ts';
import { queryScope } from './scope.ts';
import type { ScopeObservation } from './scope.ts';
import { buildCandidateCatalog, generateCandidates } from './candidates.ts';
import type { CandidateCatalog, CandidateSet } from './candidates.ts';
import { reviewSelection, selectedAction, selectionRequestSchema } from './selection.ts';
import type { SelectionRequest, SelectionView } from './selection.ts';
import { buildWordCatalog, wordPage } from './word-picker.ts';
import type { WordCatalog, WordPage, WordQuery } from './word-picker.ts';
import { actionProbe, gatePlacement, GATE_RANK_PENALTY, learnKnowledge, rankKnowledgeCandidates, rankKnowledgeSelection, validateKnowledge } from './knowledge.ts';
import { TurnLoop, turnCheckpointSchema } from './turn-loop.ts';
import type { TurnCheckpoint, TurnResolution } from './turn-loop.ts';
import type { ExecutionLimits } from './interpreter.ts';
import type { RandomEvent } from './random.ts';
import { canonicalJson, hashJson } from '../zil/integrity.ts';
import { assertSchema } from '../zil/schema.ts';
import type { Schema } from '../zil/schema.ts';
import { DIAGNOSTICS, SESSION_DEBUG } from './diagnostics.ts';
import type { ExecutionDiagnostics } from './diagnostics.ts';

export interface Expected {epoch:number;revision:number}
export interface ExecuteRequest {expected:Expected;optionId:string}
export type HostKind='SAVE'|'RESTORE'|'RESTART'|'QUIT';
export interface ZxrSave {
  format:'zxr-save-v2';abi:string;buildHash:string;kind:'boundary'|'primitive-save';
  checkpoint:TurnCheckpoint;knowledge:string[];remembered:RememberedObject[];metadata:Expected;
}
export interface HostRequest extends Expected {id:string;kind:HostKind;save?:ZxrSave}
export interface HostResult extends Expected {id:string;kind:HostKind;outcome:'success'|'failure'|'cancel';save?:ZxrSave}
export interface PendingDecision {decisionId:string;prompt:string;choices:string[]}
export interface GameOption {
  id:string;action:GameAction|{kind:'decide';decisionId:string;choice:string};label:string;
  anchor:{menu:'primary'|'more'|'decision'};rank:number;gates?:string[];
}
export type SessionState='input'|'pending'|'host'|'terminal';
/** Filtered current perception, never a raw world or handler execution. */
export interface SessionObservation extends Expected {state:SessionState;moves:number;perception:ScopeObservation}
export interface ActionResolution extends Omit<TurnResolution,'random'|'boundary'>, Expected {
  pending?:PendingDecision;host?:HostRequest;events:never[];optionId?:string;
}
export type AcceptedInput=
  | {kind:'execute';request:ExecuteRequest}
  | {kind:'selection';request:SelectionRequest;optionId:string}
  | {kind:'host';result:HostResult;saveHash?:string}
  | {kind:'import';expected:Expected;save:ZxrSave;saveHash:string};
export interface SessionOptions {
  /** Internal capability used only by the separate test/debug entry point. */
  [DIAGNOSTICS]?:ExecutionDiagnostics;
  seed?:number;limits?:Partial<ExecutionLimits>;replay?:readonly RandomEvent[];
  /** Supplemental trusted integration catalogue, separate from scope-backed staged
   * selection. Empty by default; execute never decodes arbitrary IDs. */
  actions?:readonly {action:GameAction;label:string}[];
}
const object=(properties:Record<string,Schema>,optional:Record<string,Schema>={}):Schema=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const counter:Schema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const identity=object({epoch:counter,revision:counter});
export const zxrSaveSchema:Schema=object({
  format:{const:'zxr-save-v2'},abi:{type:'string'},buildHash:{type:'string',pattern:'^[0-9a-f]{64}$'},
  kind:{enum:['boundary','primitive-save']},checkpoint:turnCheckpointSchema,
  knowledge:{type:'array',items:{type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'},maxItems:256},remembered:{type:'array',maxItems:256,items:object({id:{type:'string',pattern:'^[A-Z][A-Z0-9?.!\\-]{0,63}$'},name:{type:'string',minLength:1}})},metadata:identity,
});
const executeSchema=object({expected:identity,optionId:{type:'string',minLength:1}});
const hostSchema=object({id:{type:'string',minLength:1},epoch:counter,revision:counter,
  kind:{enum:['SAVE','RESTORE','RESTART','QUIT']},outcome:{enum:['success','failure','cancel']}},{save:zxrSaveSchema});
const own=<T>(value:T):T=>JSON.parse(canonicalJson(value)) as T;
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const publicTurn=(result:TurnResolution):Omit<TurnResolution,'random'|'boundary'>=>{
  const {random,boundary,...packet}=result;return packet;
};

/** Headless lifecycle and transport boundary. It owns all continuations; the host
 * only receives data and performs storage after a request has been published. */
export class GameSession {
  readonly #game:LoadedGame;
  readonly #replay:readonly RandomEvent[]|undefined;
  readonly #diagnostics:ExecutionDiagnostics|undefined;
  readonly #catalogue:GameOption[];
  readonly #candidateCatalog:CandidateCatalog;
  readonly #wordCatalog:WordCatalog;
  #loop:TurnLoop;
  #epoch=1;
  #revision=0;
  #nextId=1;
  #state:SessionState='input';
  #pending:PendingDecision|undefined;
  #host:HostRequest|undefined;
  #candidateCache=new Map<string,CandidateSet>();
  #knowledge:string[]=[];#remembered:RememberedObject[]=[];
  #log:AcceptedInput[]=[];
  readonly #opening:ActionResolution;
  constructor(game:LoadedGame,options:SessionOptions={}) {
    this.#game=game;this.#replay=options.replay===undefined?undefined:own(options.replay);
    this.#candidateCatalog=buildCandidateCatalog(game);
    this.#wordCatalog=buildWordCatalog(game.bundle.payload.vocabulary);
    this.#diagnostics=options[DIAGNOSTICS];
    this.#loop=new TurnLoop(game,{seed:options.seed,limits:options.limits,replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics});
    const result=this.#loop.start();
    if(result.status==='error'||result.status==='rejected')throw new Error('Session startup: '+result.error?.cause);
    const world=this.#loop.world();
    this.#catalogue=(options.actions??[]).map(({action,label},rank)=>{
      if(typeof label!=='string'||!label.length)throw new Error('Option label required');
      const plan=prepareAction(game,world,action);
      return {id:plan.optionId,action:plan.action,label,anchor:{menu:'primary'},rank};
    });
    if(new Set(this.#catalogue.map(o=>o.id)).size!==this.#catalogue.length)throw new Error('Duplicate option');
    this.#opening=this.#commit(this.#loop,result);
  }
  opening():ActionResolution {return own(this.#opening);}
  observe():SessionObservation {return {...this.#expected(),state:this.#state,moves:this.#loop.world().global('MOVES'),perception:queryScope(this.#game,this.#loop.world()).observation};}
  /** Scope-backed families. No executable IDs are minted while browsing. */
  candidates(actor='PLAYER'):CandidateSet {return own(this.#candidates(actor));}
  #candidates(actor='PLAYER'):CandidateSet {
    const world=this.#loop.world(),player=queryScope(this.#game,world);
    const name=actor==='PLAYER'?player.candidates.actor:actor;
    if(this.#state!=='input')return {buildHash:this.#game.buildHash,actor:name,families:[],exits:[]};
    if(name!==player.candidates.actor&&!player.observation.objects.some(o=>o.id===name&&o.visible))throw new Error('Actor is outside player scope');
    const cached=this.#candidateCache.get(name);if(cached)return cached;
    const physical=name===player.candidates.actor?player.candidates:queryScope(this.#game,world,{actor:name}).candidates;
    const remembered=this.#remembered.filter(o=>!physical.operands.some(p=>typeof p==='string'&&p===o.id)).map(o=>o.id);
    const scope={...physical,operands:[...physical.operands,...remembered],remembered};
    const result=rankKnowledgeCandidates(generateCandidates(this.#game,this.#candidateCatalog,scope),this.#game.bundle.payload.gateRules,this.#knowledge);
    this.#candidateCache.set(name,result);return result;
  }
  /** Pure first-page/more projection. Drafts still require commit-time validation. */
  menu(actor='PLAYER',policy:MenuPolicy={}):ActionMenu {
    const candidates=this.#candidates(actor);
    const labels=this.#labels(candidates.actor);
    return buildActionMenu(candidates,this.#expected(),this.#game.bundle.payload.gateRules,this.#knowledge,policy,labels);
  }
  selectionMenu(request:SelectionRequest,policy:MenuPolicy={}):PagedSelection {return pageSelection(this.select(request),policy);}
  actors():{actor:string;label:string;placement:'primary'|'more';gates:string[]}[] {
    if(this.#state!=='input')return [];
    const world=this.#loop.world(),perception=queryScope(this.#game,world).observation,flag=this.#game.bundle.payload.symbols.symbols.find(s=>s.name==='ACTORBIT')!.number!;
    return [{actor:'PLAYER',label:'You',...gatePlacement(this.#game.bundle.payload.gateRules,this.#knowledge,{actor:perception.actor})},
      ...perception.objects.filter(o=>o.visible&&o.id!==perception.actor&&world.hasFlag(this.#game.bundle.payload.world.entities.find(e=>e.name===o.id)!.id,flag))
        .map(o=>({actor:o.id,label:o.name,...gatePlacement(this.#game.bundle.payload.gateRules,this.#knowledge,{actor:o.id})}))]
      .sort((a,b)=>Number(a.placement==='more')-Number(b.placement==='more'));
  }
  words(query:WordQuery={}):WordPage {return wordPage(this.#wordCatalog,query);}
  /** Stateless draft review; backing up/cancelling is entirely local to the presenter. */
  select(input:SelectionRequest):SelectionView {
    assertSchema(input,selectionRequestSchema,{},'selection');const request=own(input);
    if(!this.#matches(request.expected))throw new Error('Stale epoch or revision');
    if(this.#state!=='input')throw new Error('Session is not accepting selections');
    const candidates=this.#candidates(request.actor);
    const labels=this.#labels(candidates.actor);
    const view=reviewSelection(this.#game,candidates,request,this.#wordCatalog,labels);
    return rankKnowledgeSelection(view,this.#candidateCatalog.families.find(f=>f.id===view.family),candidates.actor,this.#game.bundle.payload.gateRules,this.#knowledge);
  }
  commitSelection(input:SelectionRequest):ActionResolution {
    try {
      const view=this.select(input),request=own(input);this.#capacity();
      const plan=prepareAction(this.#game,this.#loop.world(),selectedAction(view,this.#candidateCatalog.families));
      const candidate=this.#fork(),result=candidate.execute(plan.action);
      const packet=this.#commit(candidate,result,{kind:'selection',request,optionId:plan.optionId});
      return packet.status==='error'||packet.status==='rejected'?packet:{...packet,optionId:plan.optionId};
    }catch(error){return this.#reject(message(error));}
  }
  options():GameOption[] {
    if(this.#pending)return this.#pending.choices.map((choice,rank)=>({
      id:`DECIDE:${this.#pending!.decisionId}:${choice}`,
      action:{kind:'decide',decisionId:this.#pending!.decisionId,choice},label:choice,anchor:{menu:'decision'},rank,
    }));
    if(this.#state!=='input')return [];
    const world=this.#loop.world(),player=this.#game.bundle.payload.world.entities.find(e=>e.id===world.global('PLAYER'))!.name;
    return own(this.#catalogue.map(option=>{
      const placement=gatePlacement(this.#game.bundle.payload.gateRules,this.#knowledge,actionProbe(option.action as GameAction,player));
      return {...option,anchor:{menu:placement.placement},gates:placement.gates,rank:option.rank+(placement.gates.length?GATE_RANK_PENALTY:0)};
    }).sort((a,b)=>a.rank-b.rank));
  }
  execute(input:ExecuteRequest):ActionResolution {
    try {
      assertSchema(input,executeSchema,{},'execute');const request=own(input);
      if(!this.#matches(request.expected))throw new Error('Stale epoch or revision');
      if(this.#state!=='input'&&this.#state!=='pending')throw new Error('Session is not accepting input');
      this.#capacity();
      const candidate=this.#fork();let result:TurnResolution;
      if(this.#pending){
        const option=this.options().find(o=>o.id===request.optionId);
        if(!option||option.action.kind!=='decide')throw new Error('Wrong or stale decision option');
        result=candidate.answer(option.action.choice as 'YES'|'NO'|'RESTART'|'RESTORE'|'QUIT');
      }else{
        const option=this.#catalogue.find(o=>o.id===request.optionId);
        if(!option)throw new Error('Unknown or unavailable option');
        result=candidate.execute(option.action);
      }
      return this.#commit(candidate,result,{kind:'execute',request});
    }catch(error){return this.#reject(message(error));}
  }
  completeHost(input:HostResult):ActionResolution {
    try {
      assertSchema(input,hostSchema,{},'host result');const result=own(input),request=this.#host;
      if(!request||!this.#matches(result)||result.id!==request.id||result.kind!==request.kind)throw new Error('Absent, stale or mismatched host request');
      const restoring=result.kind==='RESTORE'&&result.outcome==='success';
      if(restoring!==Object.hasOwn(result,'save'))throw new Error('Only successful RESTORE requires a save');
      if(result.kind==='QUIT'&&result.outcome!=='success')throw new Error('QUIT requires success acknowledgement');
      this.#capacity(restoring||result.kind==='RESTART'&&result.outcome==='success');
      const entry:AcceptedInput={kind:'host',result,...(restoring?{saveHash:hashJson(result.save)}:{})};
      if(restoring){
        const restored=this.#load(result.save!);
        return this.#commit(restored.loop,restored.result,entry,true,restored.knowledge,false,restored.remembered);
      }
      if(result.kind==='RESTART'&&result.outcome==='success'){
        const cp=this.#loop.checkpoint().interpreter;
        const fresh=new TurnLoop(this.#game,{seed:cp.rng.initialSeed,limits:cp.limits,replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics});
        return this.#commit(fresh,fresh.start(),entry,true,[],false,[]);
      }
      if(result.kind==='QUIT')return this.#commit(this.#loop,this.#packet('resolved'),entry,false,this.#knowledge,true);
      const candidate=this.#fork();
      return this.#commit(candidate,candidate.resumePrimitive(result.kind==='SAVE'&&result.outcome==='success'?1:0),entry);
    }catch(error){return this.#reject(message(error));}
  }
  exportSave():ZxrSave {
    if(this.#state!=='input')throw new Error('Save export requires ordinary input boundary');
    return this.#save(this.#loop,'boundary',this.#expected(),this.#knowledge);
  }
  /** Returns the resumed SAVE text when loading a primitive checkpoint; a boundary
   * load emits no text. The caller must display this packet just like execute. */
  importSave(input:ZxrSave):ActionResolution {
    if(this.#state!=='input')throw new Error('Save import requires ordinary input boundary');
    this.#capacity(true);
    const loaded=this.#load(input),save=own(input);
    const result=this.#commit(loaded.loop,loaded.result,{kind:'import',expected:this.#expected(),save,saveHash:hashJson(save)},true,loaded.knowledge,false,loaded.remembered);
    if(result.status==='error'||result.status==='rejected')throw new Error(result.error?.cause??'Save import failed');
    return result;
  }
  stateHash():string {
    // Protocol identities and the accepted-input history do not affect ZIL semantics.
    return hashJson({interpreter:this.#loop.checkpoint().interpreter,knowledge:this.#knowledge,remembered:this.#remembered,terminal:this.#state==='terminal'});
  }
  acceptedInputs():AcceptedInput[] {return own(this.#log);}
  assertReplayComplete():void {this.#loop.assertReplayComplete();}
  /** Available only to code holding the testing capability; never a player observation. */
  [SESSION_DEBUG]() {
    if(!this.#diagnostics)throw new Error('Session diagnostics are not enabled');
    return own({format:'zxr-debug-session-v1' as const,stateHash:this.stateHash(),checkpoint:this.#loop.checkpoint(),knowledge:this.#knowledge,remembered:this.#remembered,
      protocol:{...this.observe(),nextId:this.#nextId,pending:this.#pending??null,host:this.#host??null},acceptedInputs:this.#log});
  }
  /** Playback never consults external storage. Restore bytes are owned by the log.
   * Initial seed, limits, catalogue and optional oracle tape must match the run. */
  static replay(game:LoadedGame,options:SessionOptions,inputs:readonly AcceptedInput[]):GameSession {
    const entries=own(inputs),session=new GameSession(game,options);
    if(!Array.isArray(entries))throw new Error('Replay requires an input array');
    for(const entry of entries){
      let result:ActionResolution;
      if(entry.kind==='execute')result=session.execute(entry.request);
      else if(entry.kind==='selection')result=session.commitSelection(entry.request);
      else if(entry.kind==='host')result=session.completeHost(entry.result);
      else if(entry.kind==='import'){
        if(!session.#matches(entry.expected))throw new Error('Stale replay import');
        result=session.importSave(entry.save);
      }else throw new Error('Unknown replay entry');
      if(result.status==='rejected'||result.status==='error'||canonicalJson(session.#log.at(-1))!==canonicalJson(entry))throw new Error('Rejected or altered replay entry');
    }
    return session;
  }
  remembered():RememberedObject[] {return own(this.#remembered);}
  #labels(actor:string):LabelContext {
    const world=this.#loop.world(),physical=queryScope(this.#game,world,{actor}).candidates;
    const context=createLabelContext(this.#game,world,actor,physical.operands);
    const names={...context.names};for(const o of this.#remembered)if(!physical.operands.includes(o.id))names[o.id]=o.name+' (remembered)';
    return {...context,names};
  }
  #expected():Expected {return {epoch:this.#epoch,revision:this.#revision};}
  #matches(expected:Expected):boolean {return expected.epoch===this.#epoch&&expected.revision===this.#revision;}
  #capacity(epoch=false):void {
    if(this.#revision===Number.MAX_SAFE_INTEGER||this.#nextId===Number.MAX_SAFE_INTEGER||epoch&&this.#epoch===Number.MAX_SAFE_INTEGER)throw new Error('Session identity exhausted');
  }
  #fork():TurnLoop {return TurnLoop.restore(this.#game,this.#loop.checkpoint(),{replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics});}
  #save(loop:TurnLoop,kind:ZxrSave['kind'],metadata:Expected,knowledge:string[],remembered=this.#remembered):ZxrSave {
    return {format:'zxr-save-v2',abi:this.#game.bundle.payload.versions.adapter,buildHash:this.#game.buildHash,kind,checkpoint:loop.checkpoint(),knowledge:[...knowledge],remembered:own(remembered),metadata:{...metadata}};
  }
  #load(input:unknown):{loop:TurnLoop;result:TurnResolution;knowledge:string[];remembered:RememberedObject[]} {
    assertSchema(input,zxrSaveSchema,{},'save');const save=own(input as ZxrSave);
    if(save.buildHash!==this.#game.buildHash||save.abi!==this.#game.bundle.payload.versions.adapter)throw new Error('Save build or ABI mismatch');
    validateKnowledge(this.#game.bundle.payload.gateRules,save.knowledge);validateObjectMemory(this.#game,save.remembered);
    const loop=TurnLoop.restore(this.#game,save.checkpoint,{replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics}),boundary=loop.boundary();
    if(!save.checkpoint.started||!save.checkpoint.interpreter.frames.length)throw new Error('Save has no live startup continuation');
    if(save.kind==='boundary'&&boundary?.kind!=='input'||save.kind==='primitive-save'&&(boundary?.kind!=='host'||boundary.operation!=='SAVE'))throw new Error('Save checkpoint kind does not match continuation');
    const result=save.kind==='primitive-save'?loop.resumePrimitive(1):this.#packet('resolved',loop);
    if(result.status==='error'||result.status==='rejected')throw new Error('Saved success continuation: '+result.error?.cause);
    return {loop,result,knowledge:save.knowledge,remembered:save.remembered};
  }
  #packet(status:TurnResolution['status'],loop=this.#loop):TurnResolution {
    return {actionSequence:loop.checkpoint().actionSequence,status,clockTicks:0,moves:loop.world().global('MOVES'),text:[],random:[],boundary:loop.boundary()};
  }
  #reject(cause:string):ActionResolution {
    return {...publicTurn(this.#packet('rejected')),...this.#expected(),events:[],error:{cause,source:null},...(this.#pending?{pending:own(this.#pending)}:{}),...(this.#host?{host:own(this.#host)}:{})};
  }
  #commit(loop:TurnLoop,result:TurnResolution,entry?:AcceptedInput,newEpoch=false,knowledge=this.#knowledge,terminal=false,remembered=this.#remembered):ActionResolution {
    if(result.status==='error'||result.status==='rejected')return {...publicTurn(this.#packet(result.status)),...this.#expected(),events:[],...(result.error?{error:result.error}:{}),...(this.#pending?{pending:own(this.#pending)}:{}),...(this.#host?{host:own(this.#host)}:{})};
    this.#capacity(newEpoch);
    knowledge=learnKnowledge(this.#game.bundle.payload.gateRules,knowledge,result.text.join(''));
    remembered=rememberObjects(remembered,queryScope(this.#game,loop.world()).observation);
    const expected={epoch:this.#epoch+(newEpoch?1:0),revision:this.#revision+1},boundary=result.boundary;
    let pending:PendingDecision|undefined,host:HostRequest|undefined;
    let state:SessionState=terminal||boundary?.kind==='returned'?'terminal':'input';
    if(!terminal&&boundary?.kind==='decision'){
      state='pending';pending={decisionId:'d'+this.#nextId,prompt:result.text.join(''),choices:[...boundary.choices]};
    }else if(!terminal&&boundary?.kind==='host'){
      state='host';host={id:'h'+this.#nextId,...expected,kind:boundary.operation,
        ...(boundary.operation==='SAVE'?{save:this.#save(loop,'primitive-save',expected,knowledge,remembered)}:{})};
    }
    // Prepare all externally returned data before installing the staged state.
    const packet=own({...publicTurn(result),...expected,events:[],...(pending?{pending}:{}),...(host?{host}:{})}) as ActionResolution;
    const ownedEntry=entry===undefined?undefined:own(entry);
    this.#candidateCache.clear();this.#loop=loop;this.#epoch=expected.epoch;this.#revision=expected.revision;
    this.#state=state;this.#pending=pending;this.#host=host;this.#knowledge=[...knowledge];this.#remembered=own(remembered);
    if(pending||host)this.#nextId++;
    if(ownedEntry)this.#log.push(ownedEntry);
    return packet;
  }
}

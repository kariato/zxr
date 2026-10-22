import type { LoadedGame } from './bundle-loader.ts';
import { prepareAction } from './action-plan.ts';
import type { GameAction } from './action-plan.ts';
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
  format:'zxr-save-v1';abi:string;buildHash:string;kind:'boundary'|'primitive-save';
  checkpoint:TurnCheckpoint;knowledge:string[];metadata:Expected;
}
export interface HostRequest extends Expected {id:string;kind:HostKind;save?:ZxrSave}
export interface HostResult extends Expected {id:string;kind:HostKind;outcome:'success'|'failure'|'cancel';save?:ZxrSave}
export interface PendingDecision {decisionId:string;prompt:string;choices:string[]}
export interface GameOption {
  id:string;action:GameAction|{kind:'decide';decisionId:string;choice:string};label:string;
  anchor:{menu:'more'|'decision'};rank:number;
}
export type SessionState='input'|'pending'|'host'|'terminal';
/** Lifecycle-only observation. Perception and disclosed presentation events arrive in phase 4. */
export interface SessionObservation extends Expected {state:SessionState;moves:number}
export interface ActionResolution extends Omit<TurnResolution,'random'|'boundary'>, Expected {
  pending?:PendingDecision;host?:HostRequest;events:never[];
}
export type AcceptedInput=
  | {kind:'execute';request:ExecuteRequest}
  | {kind:'host';result:HostResult;saveHash?:string}
  | {kind:'import';expected:Expected;save:ZxrSave;saveHash:string};
export interface SessionOptions {
  /** Internal capability used only by the separate test/debug entry point. */
  [DIAGNOSTICS]?:ExecutionDiagnostics;
  seed?:number;limits?:Partial<ExecutionLimits>;replay?:readonly RandomEvent[];
  /** Trusted integration catalogue, not a scope/knowledge option generator. Phase 4
   * will supply available options. Empty by default; never decode arbitrary IDs. */
  actions?:readonly {action:GameAction;label:string}[];
}
const object=(properties:Record<string,Schema>,optional:Record<string,Schema>={}):Schema=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const counter:Schema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const identity=object({epoch:counter,revision:counter});
export const zxrSaveSchema:Schema=object({
  format:{const:'zxr-save-v1'},abi:{type:'string'},buildHash:{type:'string',pattern:'^[0-9a-f]{64}$'},
  kind:{enum:['boundary','primitive-save']},checkpoint:turnCheckpointSchema,
  // This build has no knowledge rules yet. Never accept invented, unversioned gates.
  knowledge:{type:'array',items:{type:'string'},maxItems:0},metadata:identity,
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
  #loop:TurnLoop;
  #epoch=1;
  #revision=0;
  #nextId=1;
  #state:SessionState='input';
  #pending:PendingDecision|undefined;
  #host:HostRequest|undefined;
  #knowledge:string[]=[];
  #log:AcceptedInput[]=[];
  readonly #opening:ActionResolution;
  constructor(game:LoadedGame,options:SessionOptions={}) {
    if(game.bundle.payload.gateRules.length)throw new Error('Unsupported knowledge rule version');
    this.#game=game;this.#replay=options.replay===undefined?undefined:own(options.replay);
    this.#diagnostics=options[DIAGNOSTICS];
    this.#loop=new TurnLoop(game,{seed:options.seed,limits:options.limits,replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics});
    const result=this.#loop.start();
    if(result.status==='error'||result.status==='rejected')throw new Error('Session startup: '+result.error?.cause);
    const world=this.#loop.world();
    this.#catalogue=(options.actions??[]).map(({action,label},rank)=>{
      if(typeof label!=='string'||!label.length)throw new Error('Option label required');
      const plan=prepareAction(game,world,action);
      return {id:plan.optionId,action:plan.action,label,anchor:{menu:'more'},rank};
    });
    if(new Set(this.#catalogue.map(o=>o.id)).size!==this.#catalogue.length)throw new Error('Duplicate option');
    this.#opening=this.#commit(this.#loop,result);
  }
  opening():ActionResolution {return own(this.#opening);}
  observe():SessionObservation {return {...this.#expected(),state:this.#state,moves:this.#loop.world().global('MOVES')};}
  options():GameOption[] {
    if(this.#pending)return this.#pending.choices.map((choice,rank)=>({
      id:`DECIDE:${this.#pending!.decisionId}:${choice}`,
      action:{kind:'decide',decisionId:this.#pending!.decisionId,choice},label:choice,anchor:{menu:'decision'},rank,
    }));
    return this.#state==='input'?own(this.#catalogue):[];
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
        return this.#commit(restored.loop,restored.result,entry,true,restored.knowledge);
      }
      if(result.kind==='RESTART'&&result.outcome==='success'){
        const cp=this.#loop.checkpoint().interpreter;
        const fresh=new TurnLoop(this.#game,{seed:cp.rng.initialSeed,limits:cp.limits,replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics});
        return this.#commit(fresh,fresh.start(),entry,true,[]);
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
    const result=this.#commit(loaded.loop,loaded.result,{kind:'import',expected:this.#expected(),save,saveHash:hashJson(save)},true,loaded.knowledge);
    if(result.status==='error'||result.status==='rejected')throw new Error(result.error?.cause??'Save import failed');
    return result;
  }
  stateHash():string {
    // Protocol identities and the accepted-input history do not affect ZIL semantics.
    return hashJson({interpreter:this.#loop.checkpoint().interpreter,knowledge:this.#knowledge,terminal:this.#state==='terminal'});
  }
  acceptedInputs():AcceptedInput[] {return own(this.#log);}
  assertReplayComplete():void {this.#loop.assertReplayComplete();}
  /** Available only to code holding the testing capability; never a player observation. */
  [SESSION_DEBUG]() {
    if(!this.#diagnostics)throw new Error('Session diagnostics are not enabled');
    return own({format:'zxr-debug-session-v1' as const,stateHash:this.stateHash(),checkpoint:this.#loop.checkpoint(),knowledge:this.#knowledge,
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
      else if(entry.kind==='host')result=session.completeHost(entry.result);
      else if(entry.kind==='import'){
        if(!session.#matches(entry.expected))throw new Error('Stale replay import');
        result=session.importSave(entry.save);
      }else throw new Error('Unknown replay entry');
      if(result.status==='rejected'||result.status==='error'||canonicalJson(session.#log.at(-1))!==canonicalJson(entry))throw new Error('Rejected or altered replay entry');
    }
    return session;
  }
  #expected():Expected {return {epoch:this.#epoch,revision:this.#revision};}
  #matches(expected:Expected):boolean {return expected.epoch===this.#epoch&&expected.revision===this.#revision;}
  #capacity(epoch=false):void {
    if(this.#revision===Number.MAX_SAFE_INTEGER||this.#nextId===Number.MAX_SAFE_INTEGER||epoch&&this.#epoch===Number.MAX_SAFE_INTEGER)throw new Error('Session identity exhausted');
  }
  #fork():TurnLoop {return TurnLoop.restore(this.#game,this.#loop.checkpoint(),{replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics});}
  #save(loop:TurnLoop,kind:ZxrSave['kind'],metadata:Expected,knowledge:string[]):ZxrSave {
    return {format:'zxr-save-v1',abi:this.#game.bundle.payload.versions.adapter,buildHash:this.#game.buildHash,kind,checkpoint:loop.checkpoint(),knowledge:[...knowledge],metadata:{...metadata}};
  }
  #load(input:unknown):{loop:TurnLoop;result:TurnResolution;knowledge:string[]} {
    assertSchema(input,zxrSaveSchema,{},'save');const save=own(input as ZxrSave);
    if(save.buildHash!==this.#game.buildHash||save.abi!==this.#game.bundle.payload.versions.adapter)throw new Error('Save build or ABI mismatch');
    const loop=TurnLoop.restore(this.#game,save.checkpoint,{replay:this.#replay,[DIAGNOSTICS]:this.#diagnostics}),boundary=loop.boundary();
    if(!save.checkpoint.started||!save.checkpoint.interpreter.frames.length)throw new Error('Save has no live startup continuation');
    if(save.kind==='boundary'&&boundary?.kind!=='input'||save.kind==='primitive-save'&&(boundary?.kind!=='host'||boundary.operation!=='SAVE'))throw new Error('Save checkpoint kind does not match continuation');
    const result=save.kind==='primitive-save'?loop.resumePrimitive(1):this.#packet('resolved',loop);
    if(result.status==='error'||result.status==='rejected')throw new Error('Saved success continuation: '+result.error?.cause);
    return {loop,result,knowledge:save.knowledge};
  }
  #packet(status:TurnResolution['status'],loop=this.#loop):TurnResolution {
    return {actionSequence:loop.checkpoint().actionSequence,status,clockTicks:0,moves:loop.world().global('MOVES'),text:[],random:[],boundary:loop.boundary()};
  }
  #reject(cause:string):ActionResolution {
    return {...publicTurn(this.#packet('rejected')),...this.#expected(),events:[],error:{cause,source:null},...(this.#pending?{pending:own(this.#pending)}:{}),...(this.#host?{host:own(this.#host)}:{})};
  }
  #commit(loop:TurnLoop,result:TurnResolution,entry?:AcceptedInput,newEpoch=false,knowledge=this.#knowledge,terminal=false):ActionResolution {
    if(result.status==='error'||result.status==='rejected')return {...publicTurn(this.#packet(result.status)),...this.#expected(),events:[],...(result.error?{error:result.error}:{}),...(this.#pending?{pending:own(this.#pending)}:{}),...(this.#host?{host:own(this.#host)}:{})};
    this.#capacity(newEpoch);
    const expected={epoch:this.#epoch+(newEpoch?1:0),revision:this.#revision+1},boundary=result.boundary;
    let pending:PendingDecision|undefined,host:HostRequest|undefined;
    let state:SessionState=terminal||boundary?.kind==='returned'?'terminal':'input';
    if(!terminal&&boundary?.kind==='decision'){
      state='pending';pending={decisionId:'d'+this.#nextId,prompt:result.text.join(''),choices:[...boundary.choices]};
    }else if(!terminal&&boundary?.kind==='host'){
      state='host';host={id:'h'+this.#nextId,...expected,kind:boundary.operation,
        ...(boundary.operation==='SAVE'?{save:this.#save(loop,'primitive-save',expected,knowledge)}:{})};
    }
    // Prepare all externally returned data before installing the staged state.
    const packet=own({...publicTurn(result),...expected,events:[],...(pending?{pending}:{}),...(host?{host}:{})}) as ActionResolution;
    const ownedEntry=entry===undefined?undefined:own(entry);
    this.#loop=loop;this.#epoch=expected.epoch;this.#revision=expected.revision;
    this.#state=state;this.#pending=pending;this.#host=host;this.#knowledge=[...knowledge];
    if(pending||host)this.#nextId++;
    if(ownedEntry)this.#log.push(ownedEntry);
    return packet;
  }
}

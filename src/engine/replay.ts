import { GameSession, zxrSaveSchema } from './session.ts';
import type { AcceptedInput, ActionResolution, SessionOptions, ZxrSave } from './session.ts';
import type { LoadedGame } from './bundle-loader.ts';
import type { ExecutionLimits } from './interpreter.ts';
import type { RandomEvent } from './random.ts';
import { selectionRequestSchema } from './selection.ts';
import { assertSchema } from '../zil/schema.ts';
import type { Schema } from '../zil/schema.ts';
import { canonicalJson } from '../zil/integrity.ts';
export type ReplayStart={kind:'seed';seed:number;limits:ExecutionLimits}|{kind:'save';save:ZxrSave};
export interface ReplayFrame {input:AcceptedInput;stateHash:string}
export interface ReplayBundle {
  format:'zxr-replay-v1';abi:string;buildHash:string;start:ReplayStart;
  /** Optional pinned oracle tape for reference recordings. Native games need only the seed/state. */
  random?:RandomEvent[];initialHash:string;frames:ReplayFrame[];
}
const object=(properties:Record<string,Schema>,optional:Record<string,Schema>={}):Schema=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const counter:Schema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},hash:Schema={type:'string',pattern:'^[0-9a-f]{64}$'},text:Schema={type:'string',minLength:1};
const expected=object({epoch:counter,revision:counter});
const host=object({id:text,epoch:counter,revision:counter,kind:{enum:['SAVE','RESTORE','RESTART','QUIT']},outcome:{enum:['success','failure','cancel']}},{save:zxrSaveSchema});
const input:Schema={anyOf:[
  object({kind:{const:'selection'},request:selectionRequestSchema,optionId:text}),
  object({kind:{const:'execute'},request:object({expected,optionId:text})}),
  object({kind:{const:'host'},result:host},{saveHash:hash}),
  object({kind:{const:'import'},expected,save:zxrSaveSchema,saveHash:hash}),
]};
export const replayBundleSchema:Schema=object({
  format:{const:'zxr-replay-v1'},abi:text,buildHash:hash,
  start:{anyOf:[object({kind:{const:'seed'},seed:{type:'integer',minimum:0,maximum:0xffffffff},limits:object({steps:counter,depth:counter,output:counter,operands:counter})}),object({kind:{const:'save'},save:zxrSaveSchema})]},
  initialHash:hash,frames:{type:'array',maxItems:100000,items:object({input,stateHash:hash})},
},{random:{type:'array',maxItems:100000,items:object({range:{type:'integer',minimum:-32768,maximum:32767},result:{type:'integer',minimum:0,maximum:32767}})}});
const own=<T>(value:T):T=>JSON.parse(canonicalJson(value)) as T;
export function validateReplay(game:LoadedGame,value:unknown):ReplayBundle {
  assertSchema(value,replayBundleSchema,{},'replay');const bundle=value as ReplayBundle;
  if(bundle.buildHash!==game.buildHash||bundle.abi!==game.bundle.payload.versions.adapter)throw new Error('Replay build or ABI mismatch');
  return own(bundle);
}
export class ReplayDivergence extends Error {
  readonly input:number;readonly expectedHash:string;readonly actualHash:string;
  constructor(input:number,expectedHash:string,actualHash:string,detail='State hash mismatch'){
    super(`Replay input ${input}: ${detail}. Expected ${expectedHash}, received ${actualHash}`);this.name='ReplayDivergence';this.input=input;this.expectedHash=expectedHash;this.actualHash=actualHash;
  }
}
/** Isolated deterministic playback. Recorded transport IDs are rebound to this
 * session, while selection IDs and the full accepted semantic input stay exact. */
export class ReplayPlayback {
  readonly session:GameSession;readonly opening:ActionResolution;
  readonly #bundle:ReplayBundle;#position=0;readonly #logStart:number;#failure:ReplayDivergence|undefined;#last:ActionResolution;
  constructor(game:LoadedGame,value:unknown){
    this.#bundle=validateReplay(game,value);const b=this.#bundle;
    const options:SessionOptions={...(b.start.kind==='seed'?{seed:b.start.seed,limits:b.start.limits}:{}),...(b.random?{replay:b.random}:{})};
    this.session=new GameSession(game,options);this.opening=b.start.kind==='save'?this.session.importSave(b.start.save):this.session.opening();this.#last=this.opening;this.#logStart=this.session.acceptedInputs().length;
    const actual=this.session.stateHash();if(actual!==b.initialHash)throw new ReplayDivergence(0,b.initialHash,actual,'Starting state hash mismatch');
  }
  get position(){return this.#position;}
  get length(){return this.#bundle.frames.length;}
  get done(){return this.#position===this.length;}
  get failure(){return this.#failure;}
  bundle(){return own(this.#bundle);}
  step():{packet:ActionResolution;label:string;stateHash:string}|undefined {
    if(this.#failure)throw this.#failure;if(this.done)return;
    const frame=this.#bundle.frames[this.#position]!,entry=own(frame.input),o=this.session.observe(),expected={epoch:o.epoch,revision:o.revision};let packet:ActionResolution,label:string;
    try{
      if(entry.kind==='selection'){
        entry.request.expected=expected;label=this.session.select(entry.request).label;packet=this.session.commitSelection(entry.request);
      }else if(entry.kind==='execute'){
        const match=/^DECIDE:d[0-9]+:(YES|NO|RESTART|RESTORE|QUIT)$/.exec(entry.request.optionId);
        const option=match&&this.session.options().find(option=>option.action.kind==='decide'&&option.action.choice===match[1]);
        if(!option)throw new Error('Unavailable decision option; ordinary replay choices require a staged selection');
        entry.request={expected,optionId:option.id};label=option.label;packet=this.session.execute(entry.request);
      }else if(entry.kind==='host'){
        const request=this.#last.host;if(!request||request.kind!==entry.result.kind)throw new Error('Host operation does not match the suspended continuation');
        entry.result={...entry.result,id:request.id,...expected};label=entry.result.kind+' '+entry.result.outcome;packet=this.session.completeHost(entry.result);
      }else{
        entry.expected=expected;label='Restore saved game';packet=this.session.importSave(entry.save);
      }
      if(packet.status==='rejected'||packet.status==='error')throw new Error(packet.error?.cause??packet.status);
      if(canonicalJson(this.session.acceptedInputs(this.#logStart+this.#position).at(-1))!==canonicalJson(entry))throw new Error('Chosen option ID or accepted input differs');
      const actual=this.session.stateHash();if(actual!==frame.stateHash)throw new ReplayDivergence(this.#position+1,frame.stateHash,actual);
      this.#last=packet;this.#position++;return {packet,label,stateHash:actual};
    }catch(cause){
      this.#failure=cause instanceof ReplayDivergence?cause:new ReplayDivergence(this.#position+1,frame.stateHash,this.session.stateHash(),cause instanceof Error?cause.message:String(cause));throw this.#failure;
    }
  }
}
/** Capture immediately after EACH accepted input, including host completions.
 * A batch cannot be assigned retrospective per-input hashes. */
export class ReplayRecorder {
  readonly #session:GameSession;readonly #bundle:ReplayBundle;#cursor:number;
  constructor(game:LoadedGame,session:GameSession,options:{start?:ReplayStart;random?:readonly RandomEvent[]}={}){
    const save=session.exportSave(),count=session.acceptedInputs().length,start=options.start??(count?{kind:'save' as const,save}:{kind:'seed' as const,seed:save.checkpoint.interpreter.rng.initialSeed,limits:save.checkpoint.interpreter.limits});
    this.#session=session;this.#cursor=count;this.#bundle=own({format:'zxr-replay-v1',abi:save.abi,buildHash:game.buildHash,start,initialHash:session.stateHash(),frames:[],...(options.random?{random:[...options.random]}:{})});
    new ReplayPlayback(game,this.#bundle);
  }
  capture(){
    const inputs=this.#session.acceptedInputs(this.#cursor);if(!inputs.length)return;
    if(inputs.length!==1)throw new Error('Replay recorder missed an accepted input boundary');
    if(this.#bundle.frames.length===100000)throw new Error('Replay input limit reached');
    const entry=inputs[0]!;if(entry.kind==='execute'&&!entry.request.optionId.startsWith('DECIDE:'))throw new Error('Portable replay requires scope-backed selections');
    this.#bundle.frames.push({input:entry,stateHash:this.#session.stateHash()});this.#cursor++;
  }
  bundle(){return own(this.#bundle);}
}

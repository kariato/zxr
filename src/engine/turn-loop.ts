import { Interpreter } from './interpreter.ts';
import type { InterpreterCheckpoint, InterpreterResult, ExecutionLimits } from './interpreter.ts';
import type { LoadedGame } from './bundle-loader.ts';
import type { RandomEvent } from './random.ts';
import type { Span } from '../zil/ast.ts';
import { canonicalJson, hashJson } from '../zil/integrity.ts';
import { assertSchema } from '../zil/schema.ts';
import { checkpointSchema } from './checkpoint.ts';
import { DIAGNOSTICS } from './diagnostics.ts';
import type { ExecutionDiagnostics } from './diagnostics.ts';

export type TurnBoundary = {kind:'input'}
  | {kind:'decision';routine:'YES?'|'FINISH';choices:string[]}
  | {kind:'host';operation:'SAVE'|'RESTORE'|'RESTART'|'QUIT'}
  | {kind:'returned';value:number};
/** Execution packet used to assemble the public ActionResolution in the session layer.
 * No observation, option generation, external saves or host side effects happen here. */
export interface TurnResolution {
  actionSequence:number;status:'resolved'|'rejected'|'pending'|'host'|'error';
  clockTicks:number;moves:number;text:string[];random:RandomEvent[];
  boundary:TurnBoundary|null;error?:{cause:string;source:Span|null};
}
export interface TurnCheckpoint {
  format:'zxr-turn-checkpoint-v1';started:boolean;actionSequence:number;interpreter:InterpreterCheckpoint;
}
export const turnCheckpointSchema={type:'object' as const,properties:{
  format:{const:'zxr-turn-checkpoint-v1'},started:{type:'boolean' as const},
  actionSequence:{type:'integer' as const,minimum:0,maximum:Number.MAX_SAFE_INTEGER},interpreter:checkpointSchema,
},required:['format','started','actionSequence','interpreter'],additionalProperties:false};
type Options={seed?:number;limits?:Partial<ExecutionLimits>;replay?:readonly RandomEvent[];[DIAGNOSTICS]?:ExecutionDiagnostics};

/** Internal turn coordinator. The session protocol (epochs, correlated input/host IDs,
 * save envelopes) belongs above this layer, independently of the translated loop. */
export class TurnLoop {
  readonly #game:LoadedGame;
  #vm:Interpreter;
  #started=false;
  #sequence=0;
  constructor(game:LoadedGame,options:Options={}) {
    if(!game.bundle.payload.logic.adapter||!game.bundle.payload.memory.globals.some(g=>g.name==='MOVES'))throw new Error('Turn loop requires a structured parser adapter and MOVES');
    this.#game=game;this.#vm=new Interpreter(game,{...options,inputBoundary:'read'});
  }
  start():TurnResolution {
    if(this.#started)return this.#reject('Turn loop already started');
    const before=this.#moves(),result=this.#vm.run();
    if(result.status!=='error')this.#started=true;
    return this.#publish(result,before);
  }
  execute(action:unknown):TurnResolution {
    if(!this.#started||!this.#vm.atInput())return this.#reject('Turn loop is not waiting for a fresh action');
    if(this.#sequence===Number.MAX_SAFE_INTEGER)return this.#reject('Action sequence exhausted');
    const before=this.#moves();
    let result:InterpreterResult;
    try {result=this.#vm.executeAction(action);}catch(error){return this.#reject(error instanceof Error?error.message:String(error));}
    if(result.status!=='error')this.#sequence++;
    return this.#publish(result,before);
  }
  /** Internal continuation only. The session layer must correlate the decision first. */
  answer(choice:'YES'|'NO'|'RESTART'|'RESTORE'|'QUIT'):TurnResolution {
    if(!this.#started||this.#vm.atInput())return this.#reject('Turn loop is not waiting for a decision');
    const before=this.#moves();
    try {return this.#publish(this.#vm.answer(choice),before);}catch(error){return this.#reject(error instanceof Error?error.message:String(error));}
  }
  /** SAVE results and failed RESTORE/RESTART only. GameSession owns successful replacement. */
  resumePrimitive(value:number):TurnResolution {
    const before=this.#moves();
    try {return this.#publish(this.#vm.resume(value),before);}catch(error){return this.#reject(error instanceof Error?error.message:String(error));}
  }
  world(){return this.#vm.world();}
  boundary():TurnBoundary|null {return this.#boundary();}
  /** Diagnostic checkpoint, not a public save or an accepted host restore payload. */
  checkpoint():TurnCheckpoint {return {format:'zxr-turn-checkpoint-v1',started:this.#started,actionSequence:this.#sequence,interpreter:this.#vm.checkpoint()};}
  stateHash():string {return hashJson(this.checkpoint());}
  static restore(game:LoadedGame,input:unknown,options:Pick<Options,'replay'|typeof DIAGNOSTICS>={}):TurnLoop {
    assertSchema(input,turnCheckpointSchema,{},'turn checkpoint');
    const checkpoint=JSON.parse(canonicalJson(input)) as TurnCheckpoint;
    if(checkpoint.interpreter.inputBoundary!=='read'||!checkpoint.started&&checkpoint.actionSequence!==0)throw new Error('Invalid turn checkpoint boundary');
    const loop=new TurnLoop(game,{...options,seed:checkpoint.interpreter.rng.initialSeed,limits:checkpoint.interpreter.limits});
    const vm=Interpreter.restore(game,checkpoint.interpreter,options);
    if(!checkpoint.started&&vm.stateHash()!==loop.#vm.stateHash())throw new Error('Invalid unstarted turn checkpoint');
    const root=vm.inspect().frames[0];
    if(root&&(root.program!=='runtime'||root.routine!==game.bundle.payload.initialization.routine.id))throw new Error('Turn checkpoint has no startup continuation');
    if(checkpoint.started&&!vm.atInput()&&!vm.inspect().wait&&vm.inspect().result===null)throw new Error('Turn checkpoint is not at an exposed boundary');
    loop.#vm=vm;loop.#started=checkpoint.started;loop.#sequence=checkpoint.actionSequence;
    return loop;
  }
  #moves():number {return this.#vm.world().global('MOVES');}
  #boundary():TurnBoundary|null {
    if(!this.#started)return null;
    if(this.#vm.atInput())return {kind:'input'};
    const {wait,result}=this.#vm.inspect();
    if(!wait)return result===null?null:{kind:'returned',value:result};
    if(wait.kind==='READ'){
      const name=this.#game.routine(wait.routine)?.name;
      if(name==='YES?')return {kind:'decision',routine:name,choices:['YES','NO']};
      if(name==='FINISH')return {kind:'decision',routine:name,choices:['RESTART','RESTORE','QUIT']};
      throw new Error('Unclassified decision READ');
    }
    if(wait.kind==='SAVE'||wait.kind==='RESTORE'||wait.kind==='RESTART'||wait.kind==='QUIT')return {kind:'host',operation:wait.kind};
    throw new Error('Unclassified turn boundary');
  }
  #publish(result:InterpreterResult,before:number):TurnResolution {
    const moves=this.#moves(),boundary=this.#boundary();
    return {actionSequence:this.#sequence,status:result.status==='error'?'error':boundary?.kind==='decision'?'pending':boundary?.kind==='host'?'host':'resolved',clockTicks:(moves-before+65536)%65536,moves,text:result.text,random:result.random,boundary,...(result.status==='error'?{error:{cause:result.cause,source:result.source}}:{})};
  }
  #reject(cause:string):TurnResolution {
    return {actionSequence:this.#sequence,status:'rejected',clockTicks:0,moves:this.#moves(),text:[],random:[],boundary:this.#boundary(),error:{cause,source:null}};
  }
}

import { prepareAction } from './action-plan.ts';
import type { ActionPlan, PlannedOperand } from './action-plan.ts';
import type { LoadedGame } from './bundle-loader.ts';
import { writeReadText, writeReadWord } from './read-input.ts';
import { WorldState } from './world-state.ts';
import { GameRandom } from './random.ts';
import type { RandomEvent } from './random.ts';
import { assertWord, numeric, signed, updateCompare } from './numeric.ts';
import { decodeZText } from './text.ts';
import { logicExpressions } from '../zil/logic.ts';
import type { LogicBinding, LogicCommand, LogicExpression, LogicRoutine, ReturnTarget, Variable } from '../zil/logic.ts';
import { checkpointSchema } from './checkpoint.ts';
import { assertSchema } from '../zil/schema.ts';
import { canonicalJson, hashJson } from '../zil/integrity.ts';
import type { RandomSnapshot } from './random.ts';
import type { WorldSnapshot } from './world-state.ts';
import type { Span } from '../zil/ast.ts';

type ExpressionTask = {kind:'expression';id:number;stage:number;values:number[]};
type ActivationTask = {kind:'activation';expression:number|null;phase:'bindings'|'body';index:number;waiting:boolean;last:number;args:number[]};
type Task = ExpressionTask|ActivationTask;
export type ExecutionProgram='runtime'|'parser-entry'|'parser-checks'|'parser-no-verb'|'parser-not-here';
interface ScopeTarget {operand:PlannedOperand|null;slot:0|1;noun:number;adjective:number;adjectiveWord:number|null;updateOne:boolean;first:boolean;multiple:boolean}
interface ScopeSearch {plan:ActionPlan;targets:ScopeTarget[];index:number;base:number;phase:'room'|'inventory'|'global';retry:boolean;depth:number;}
interface Frame {program:ExecutionProgram;routine:number;locals:number[];operands:number[];tasks:Task[]}
export interface ExecutionLimits {steps:number;depth:number;output:number;operands:number}
export interface InterpreterWait {kind:'parser'|'READ'|'SAVE'|'RESTORE'|'RESTART'|'QUIT';routine:number;expression:number;args:number[]}
export type InterpreterResult = {status:'returned';value:number;text:string[];random:RandomEvent[]}
  | {status:'suspended';wait:InterpreterWait;text:string[];random:RandomEvent[]}
  | {status:'error';cause:string;source:Span|null;text:[];random:[]};
export interface InterpreterCheckpoint {
  format:'zxr-interpreter-checkpoint-v1';buildHash:string;inputBoundary:'parser'|'read';limits:ExecutionLimits;
  frames:Frame[];wait:InterpreterWait|null;result:number|null;steps:number;output:number;
  world:WorldSnapshot;rng:RandomSnapshot;
}
const DEFAULT_LIMITS:ExecutionLimits={steps:1_000_000,depth:256,output:1_000_000,operands:65536};

/** Low-level execution core. Parser/protocol, public saves and host acknowledgements are separate layers. */
export class Interpreter {
  readonly #game:LoadedGame;
  readonly #expressions=new Map<string,LogicExpression[]>();
  readonly #indices=new Map<LogicExpression,number>();
  readonly #limits:ExecutionLimits;
  readonly #inputBoundary:'parser'|'read';
  readonly #random:GameRandom;
  #world:WorldState;
  #frames:Frame[]=[];
  #wait:InterpreterWait|null=null;
  #result:number|null=null;
  #steps=0;
  #output=0;
  #text:string[]=[];
  #source:Span|null=null;
  #pendingPlan:ActionPlan|null=null;
  #scope:ScopeSearch|null=null;
  #speech:ActionPlan|null=null;
  #quotedCommand:ActionPlan|null=null;
  #quotedError:{kind:'unknown'|'cant-use'|'no-verb';clause:boolean}|null=null;
  #actor:{plan:ActionPlan;phase:'tell'|'command'}|null=null;

  constructor(game:LoadedGame,options:{inputBoundary?:'parser'|'read';world?:WorldState;fragment?:'entry'|'checks'|'no-verb'|'not-here';routine?:number;args?:readonly number[];replay?:readonly RandomEvent[];limits?:Partial<ExecutionLimits>}={}){
    this.#game=game;
    if(options.world&&options.world.buildHash!==game.buildHash)throw new Error('Execution world belongs to another build');
    this.#world=options.world?options.world.fork():WorldState.create(game);
    if(options.world)this.#world.validate();
    this.#random=game.createRandom(options.replay);
    this.#inputBoundary=options.inputBoundary ?? 'parser';
    if(!['parser','read'].includes(this.#inputBoundary))throw new Error('Invalid input boundary');
    this.#limits={...DEFAULT_LIMITS,...options.limits};
    for(const [key,value] of Object.entries(this.#limits))if(!Number.isSafeInteger(value)||value<1||value>DEFAULT_LIMITS[key as keyof ExecutionLimits])throw new Error('Invalid interpreter limit '+key);
    const adapter=game.bundle.payload.logic.adapter;
    const programs:[ExecutionProgram,Readonly<LogicRoutine>][]=[...game.bundle.payload.logic.routines.map(r=>['runtime',r] as [ExecutionProgram,Readonly<LogicRoutine>]),...(adapter?[['parser-entry',adapter.entry],['parser-checks',adapter.checks],['parser-no-verb',adapter.noVerb],['parser-not-here',adapter.notHere]] as [ExecutionProgram,Readonly<LogicRoutine>][]:[])];
    for(const [program,routine] of programs){
      const expressions=[...logicExpressions(routine)];
      this.#expressions.set(program+':'+routine.id,expressions);
      expressions.forEach((e,i)=>this.#indices.set(e,i));
    }
    if(options.fragment!==undefined){
      if(!['entry','checks','no-verb','not-here'].includes(options.fragment)||!adapter||options.routine!==undefined||options.fragment!=='not-here'&&options.args?.length)throw new Error('Invalid parser fragment entry');
      if(options.fragment==='entry'&&this.#world.global('RESERVE-PTR'))throw new Error('Reserved parser input is unsupported');
      this.#call(options.fragment==='not-here'?adapter.notHere.id:options.fragment==='no-verb'?adapter.noVerb.id:adapter.id,[...(options.args ?? [])],options.fragment==='not-here'?'parser-not-here':options.fragment==='entry'?'parser-entry':options.fragment==='no-verb'?'parser-no-verb':'parser-checks');
    }else this.#call(options.routine ?? game.bundle.payload.initialization.routine.id,[...(options.args ?? [])]);
  }
  /** An independent world view. Mutating it cannot alter this execution. */
  world():WorldState {return this.#world.fork();}
  /** Diagnostic continuation only; it is not an accepted external save format. */
  inspect(){return {buildHash:this.#game.buildHash,frames:structuredFrames(this.#frames),wait:copyWait(this.#wait),result:this.#result,steps:this.#steps,output:this.#output,rng:this.#random.snapshot()};}

  /** Complete low-level execution state, excluding the not-yet-implemented public session protocol. */
  checkpoint():InterpreterCheckpoint {
    return {format:'zxr-interpreter-checkpoint-v1',buildHash:this.#game.buildHash,inputBoundary:this.#inputBoundary,limits:{...this.#limits},frames:structuredFrames(this.#frames),wait:copyWait(this.#wait),result:this.#result,steps:this.#steps,output:this.#output,world:this.#world.snapshot(),rng:this.#random.snapshot()};
  }
  stateHash():string {return hashJson(this.checkpoint());}
  static restore(game:LoadedGame,input:unknown,options:{replay?:readonly RandomEvent[]}={}):Interpreter {
    assertSchema(input,checkpointSchema,{},'interpreter checkpoint');
    // Canonical serialization also rejects prototypes, cycles, sparse arrays and non-JSON values.
    const checkpoint=JSON.parse(canonicalJson(input)) as InterpreterCheckpoint;
    if(checkpoint.buildHash!==game.buildHash)throw new Error('Incompatible interpreter checkpoint build');
    const vm=new Interpreter(game,{limits:checkpoint.limits,inputBoundary:checkpoint.inputBoundary,...options});
    vm.#frames=checkpoint.frames;vm.#wait=checkpoint.wait;vm.#result=checkpoint.result;vm.#steps=checkpoint.steps;vm.#output=checkpoint.output;
    vm.#validateContinuation();
    vm.#world=WorldState.restore(game,checkpoint.world);vm.#random.restore(checkpoint.rng);
    if(vm.#frames[0]?.program==='parser-entry'&&vm.#world.global('RESERVE-PTR'))throw new Error('Reserved parser input is unsupported');
    return vm;
  }
  run():InterpreterResult {return this.#segment();}
  /** Internal primitive result. Higher layers must validate protocol IDs and write READ/parser buffers first. */
  resume(value:number):InterpreterResult {
    assertWord(value);
    if(!this.#wait)throw new Error('Interpreter is not suspended');
    if(this.#wait.kind==='QUIT'||(this.#wait.kind==='RESTART'||this.#wait.kind==='RESTORE')&&value!==0)throw new Error('Successful quit/restart/restore requires session replacement');
    if(this.#wait.kind==='parser'||this.#wait.kind==='READ')throw new Error('Parser and READ require the future input adapter');
    if(value>1)throw new Error('Host primitive result must be zero or one');
    return this.#segment(value);
  }
  /** Internal decision answer. Public callers still need the later correlated decision protocol. */
  answer(choice:'YES'|'NO'|'RESTART'|'RESTORE'|'QUIT'):InterpreterResult {
    if(this.#wait?.kind!=='READ')throw new Error('Interpreter is not waiting for a decision');
    const name=this.#game.routine(this.#wait.routine)?.name;
    if(name==='YES?'?!['YES','NO'].includes(choice):name==='FINISH'?!['RESTART','RESTORE','QUIT'].includes(choice):true)throw new Error('Unsupported READ decision choice or routine');
    return this.#segment({read:choice});
  }
  /** Structured actions with source-derived scope, actor passes and bounded quoted speech. */
  executeAction(action:unknown):InterpreterResult {
    if(!this.atInput()||this.#world.global('P-CONT'))throw new Error('Not at a fresh parser boundary');
    if(this.#world.global('RESERVE-PTR'))throw new Error('Reserved parser input is unsupported');
    const plan=prepareAction(this.#game,this.#world,action),a=plan.action;
    if(a.kind==='act'&&['ANSWER','SAY','INCANT'].includes(a.verb))throw new Error('Action requires the full parser adapter');
    return this.#segment({action:plan});
  }
  /** Fresh structured input only; nested YES?/FINISH READs are separate decisions. */
  atInput():boolean {return this.#wait?.kind==='parser'||this.#wait?.kind==='READ'&&this.#frames.at(-1)?.program==='parser-entry';}
  /** Compatibility alias for the original limited integration API. */
  executeSimpleAction(action:unknown):InterpreterResult {return this.executeAction(action);}
  resumeParserRead(text:string):InterpreterResult {
    if(this.#wait?.kind!=='READ'||this.#frames.at(-1)?.program!=='parser-entry'||this.#frames.length!==1)throw new Error('Raw parser READ is restricted to a standalone diagnostic fragment');
    return this.#segment({parserText:text});
  }
  #segment(resume?:number|{read:string}|{parserText:string}|{action:ActionPlan}):InterpreterResult {
    const oldWorld=this.#world,oldFrames=structuredFrames(this.#frames),oldWait=copyWait(this.#wait),oldResult=this.#result,oldSteps=this.#steps,oldOutput=this.#output,oldRandom=this.#random.snapshot(),oldPlan=this.#pendingPlan,oldScope=this.#scope,oldSpeech=this.#speech,oldQuotedCommand=this.#quotedCommand,oldQuotedError=this.#quotedError,oldActor=this.#actor;
    this.#world=this.#world.fork();this.#text=[];
    try {
      if(resume!==undefined){
        if(this.#wait)this.#source=this.#expression(this.#frames.at(-1)!,this.#wait.expression).source;
        if(typeof resume==='object'&&'action' in resume){
          const read=this.#wait!.kind==='READ'?this.#wait:null;
          this.#pendingPlan=resume.action;this.#actor=resume.action.actorPass?{plan:resume.action,phase:'tell'}:null;this.#speech=resume.action.action.kind==='say'?resume.action:null;this.#steps=0;this.#output=0;this.#wait=null;
          if(read){this.#world=writeReadText(this.#game,this.#world,read.args[0]!,read.args[1]!,resume.action.input.text);this.#finish(1);}
          else this.#call(this.#game.bundle.payload.logic.adapter!.id,[],'parser-entry');
        }else {
          if(typeof resume==='object'){const [text,parse]=this.#wait!.args;this.#world='parserText' in resume?writeReadText(this.#game,this.#world,text!,parse!,resume.parserText):writeReadWord(this.#game,this.#world,text!,parse!,resume.read);}
          this.#wait=null;this.#finish(typeof resume==='number'?resume:1);
        }
      }
      while(!this.#wait&&this.#result===null){
        if(++this.#steps>this.#limits.steps)throw new Error('Interpreter step budget exhausted');
        this.#step();
      }
      if(this.#pendingPlan||this.#scope||this.#speech||this.#quotedCommand||this.#quotedError||this.#actor)throw new Error('Unsupported suspension during parser adaptation');
      this.#world.validate();
      const text=this.#text;this.#text=[];
      const random=this.#random.drainEvents();
      return this.#wait?{status:'suspended',wait:copyWait(this.#wait)!,text,random}:{status:'returned',value:this.#result!,text,random};
    }catch(error){
      const source=this.#source;
      this.#world=oldWorld;this.#frames=oldFrames;this.#wait=oldWait;this.#result=oldResult;this.#steps=oldSteps;this.#output=oldOutput;this.#random.restore(oldRandom);this.#pendingPlan=oldPlan;this.#scope=oldScope;this.#speech=oldSpeech;this.#quotedCommand=oldQuotedCommand;this.#quotedError=oldQuotedError;this.#actor=oldActor;this.#text=[];
      return {status:'error',cause:error instanceof Error?error.message:String(error),source,text:[],random:[]};
    }
  }
  #routine(frame=this.#frames.at(-1)!):Readonly<LogicRoutine> {
    const routine=this.#definition(frame.routine,frame.program);if(!routine)throw new Error('Unknown runtime routine '+frame.routine);return routine;
  }
  #expression(frame:Frame,id:number):LogicExpression {
    const expression=this.#expressions.get(frame.program+':'+frame.routine)?.[id];if(!expression)throw new Error('Invalid expression cursor');return expression;
  }
  #enqueueExpression(expression:LogicExpression):void {
    const id=this.#indices.get(expression);if(id===undefined)throw new Error('Unindexed expression');
    const tasks=this.#frames.at(-1)!.tasks;if(tasks.length>=65536)throw new Error('Expression stack budget exhausted');
    tasks.push({kind:'expression',id,stage:0,values:[]});
  }
  #definition(id:number,program:ExecutionProgram):Readonly<LogicRoutine>|undefined {
    if(program==='runtime')return this.#game.routine(id);
    const adapter=this.#game.bundle.payload.logic.adapter;
    if(!adapter)return;
    if(program==='parser-not-here')return id===adapter.notHere.id?adapter.notHere:undefined;
    if(program==='parser-no-verb')return id===adapter.noVerb.id?adapter.noVerb:undefined;
    if(adapter.id!==id)return;
    return program==='parser-entry'?adapter.entry:program==='parser-checks'?adapter.checks:undefined;
  }
  #call(id:number,args:number[],program:ExecutionProgram='runtime'):void {
    for(const n of args)assertWord(n);
    const routine=this.#definition(id,program);
    if(!routine)throw new Error('Unknown or removed runtime routine '+id);
    if(args.length<routine.required||args.length>routine.required+routine.optional)throw new Error('Invalid call arity for '+routine.name);
    if(this.#frames.length>=this.#limits.depth)throw new Error('Interpreter call depth exhausted');
    this.#frames.push({program,routine:id,locals:Array(routine.slotCount+1).fill(0),operands:[],tasks:[{kind:'activation',expression:null,phase:'bindings',index:0,waiting:false,last:1,args}]});
  }
  #deliver(value:number):void {
    assertWord(value);
    const frame=this.#frames.at(-1);if(!frame){this.#result=value;return;}
    const task=frame.tasks.at(-1);if(!task)throw new Error('Missing return continuation');
    if(task.kind==='expression')task.values.push(value);
    else {
      if(!task.waiting)throw new Error('Unexpected activation value');
      if(task.phase==='bindings')frame.locals[this.#activation(frame,task).bindings[task.index]!.slot]=value;
      else task.last=value;
      task.index++;task.waiting=false;
    }
  }
  #finish(value:number):void {this.#frames.at(-1)!.tasks.pop();this.#deliver(value);}
  #return(value:number):void {
    const frame=this.#frames.pop()!;
    if(frame.program==='parser-entry'&&this.#pendingPlan){
      const plan=this.#pendingPlan;this.#pendingPlan=null;
      if(this.#actor?.phase==='tell'){this.#beginActorTell(plan);return;}
      this.#populateAction(plan);
      // TELL has handed control to the translated command. It may itself pause
      // at a decision/host primitive; no native actor controller crosses that boundary.
      if(this.#actor?.phase==='command')this.#actor=null;
      if(plan.dispatch.kind==='walk')this.#deliver(plan.dispatch.direction);
      else this.#beginScope(plan);
    }else if(frame.program==='parser-entry'&&this.#quotedCommand){
      const plan=this.#quotedCommand,speech=this.#speech!,token=speech.input.tokens[(speech.speech!.continuation-1)/2]!;
      this.#populateAction(plan);
      if(plan.dispatch.kind==='walk'){
        // A bare direction returns before the closing quote is scanned. The
        // source keeps the SAY verb record/syntax and remaining lexical count.
        this.#world.setGlobal('P-LEN',speech.speech!.remaining-1);
        this.#speech=null;this.#quotedCommand=null;this.#deliver(plan.dispatch.direction);return;
      }
      const verb=this.#world.global('P-VTBL');this.#world.putWord(verb,0,token.address);this.#world.putByte(verb,2,token.length);this.#world.putByte(verb,3,token.offset);
      if(plan.clauses.length&&plan.dispatch.kind==='syntax')this.#world.setGlobal('P-ACT',plan.dispatch.lexical);
      const last=plan.clauses.at(-1),selection=last?.slot===0?plan.direct:plan.indirect;
      const terminalMany=selection?.kind==='all'||selection?.kind==='objects'&&selection.objects.length>1;
      this.#world.setGlobal('P-LEN',terminalMany?65535:0);this.#world.putByte(this.#world.global('P-LEXV'),1,terminalMany?speech.speech!.remaining:0);this.#world.setGlobal('QUOTE-FLAG',terminalMany?0:1);
      this.#speech=null;this.#quotedCommand=null;this.#beginScope(plan);
    }else if(frame.program==='parser-entry'&&this.#quotedError){
      const error=this.#quotedError,speech=this.#speech!,world=this.#world;this.#quotedError=null;this.#speech=null;
      world.setGlobal('P-NUMBER',0);world.setGlobal('P-DIR',0);world.setGlobal('P-GETFLAGS',0);world.setGlobal('P-NCN',error.clause?1:0);world.setGlobal('P-LEN',error.kind==='no-verb'?0:1);
      if(error.clause){world.setGlobal('P-ACT',0);world.putWord(world.global('P-ITBL'),6,world.global('P-LEXV')+2*speech.speech!.continuation);}
      if(error.kind==='no-verb'){
        if(error.clause)world.putWord(world.global('P-ITBL'),7,world.global('P-LEXV')+2*speech.speech!.continuation+4);
        world.setGlobal('QUOTE-FLAG',1);world.putByte(world.global('P-LEXV'),1,0);world.setGlobal('P-WALK-DIR',0);world.setGlobal('AGAIN-DIR',0);
        this.#call(this.#game.bundle.payload.logic.adapter!.noVerb.id,[],'parser-no-verb');
      }else this.#call(this.#symbol(error.kind==='unknown'?'UNKNOWN-WORD':'CANT-USE'),[speech.speech!.continuation]);
    }else if(this.#scope&&this.#frames.length===this.#scope.depth){
      if(frame.program==='parser-not-here'){
        if(value)this.#finishScopeTarget();
        else {this.#scope=null;this.#deliver(0);}
      }else this.#advanceScope();
    }
    else this.#deliver(value);
  }
  #activation(frame:Frame,task:ActivationTask):{bindings:LogicBinding[];body:LogicCommand[];repeat:boolean}{
    if(task.expression===null){const r=this.#routine(frame);return {bindings:r.bindings,body:r.body,repeat:false};}
    const e=this.#expression(frame,task.expression);if(e.op!=='block')throw new Error('Invalid block activation');return {...e,repeat:e.kind==='repeat'};
  }
  #variable(frame:Frame,variable:Variable|number):number {
    const n=typeof variable==='number'?variable:variable.number;
    if(n>=16)return this.#world.global(n);
    if(!Number.isInteger(n)||n<1||n>=frame.locals.length)throw new Error('Invalid local variable number '+n);
    return frame.locals[n]!;
  }
  #store(frame:Frame,variable:Variable,value:number):void {
    if(variable.scope==='global')this.#world.setGlobal(variable.number,value);
    else {if(variable.number<1||variable.number>=frame.locals.length)throw new Error('Invalid local variable');frame.locals[variable.number]=assertWord(value);}
  }
  #unwind(target:ReturnTarget,value?:number):void {
    const frame=this.#frames.at(-1)!;
    if(target.kind==='routine'&&value!==undefined){this.#return(value);return;}
    const index=frame.tasks.findLastIndex(t=>t.kind==='activation'&&(target.kind==='routine'?t.expression===null:t.expression!==null&&this.#expression(frame,t.expression).op==='block'&&(this.#expression(frame,t.expression) as Extract<LogicExpression,{op:'block'}>).id===target.id));
    const task=frame.tasks[index];if(!task||task.kind!=='activation')throw new Error('Inactive control-flow target');
    frame.tasks.length=index+1;
    if(value===undefined){task.phase='body';task.index=0;task.waiting=false;task.last=1;}
    else {frame.tasks.pop();this.#deliver(value);}
  }
  #step():void {
    const frame=this.#frames.at(-1)!,task=frame.tasks.at(-1)!;
    if(task.kind==='activation'){
      const {bindings,body,repeat}=this.#activation(frame,task);
      if(task.waiting)throw new Error('Activation is missing its child continuation');
      if(task.phase==='bindings'){
        const binding=bindings[task.index];
        if(!binding){task.phase='body';task.index=0;return;}
        this.#source=binding.source;
        if((binding.kind==='required'||binding.kind==='optional')&&task.index<task.args.length){frame.locals[binding.slot]=task.args[task.index]!;task.index++;return;}
        if(binding.initializer){task.waiting=true;this.#enqueueExpression(binding.initializer);}
        else {frame.locals[binding.slot]=0;task.index++;}
        return;
      }
      const command=body[task.index];
      if(command){task.waiting=true;this.#enqueueExpression(command.expression);return;}
      if(repeat){task.index=0;task.last=1;return;}
      frame.tasks.pop();if(task.expression===null)this.#return(task.last);else this.#deliver(task.last);return;
    }
    const e=this.#expression(frame,task.id),values=task.values;
    this.#source=e.source;
    const one=(child:LogicExpression,done:(value:number)=>void)=>{if(!values.length)this.#enqueueExpression(child);else done(values[0]!);};
    switch(e.op){
      case 'literal':case 'symbol':case 'address':this.#finish(e.value);return;
      case 'string':this.#finish(e.handle);return;
      case 'variable-number':this.#finish(e.variable.number);return;
      case 'load':this.#finish(this.#variable(frame,e.variable));return;
      case 'store':one(e.value,v=>{this.#store(frame,e.variable,v);this.#finish(v);});return;
      case 'value':one(e.variable,v=>this.#finish(this.#variable(frame,v)));return;
      case 'update-compare':one(e.bound,v=>{const result=updateCompare(e.operator,this.#variable(frame,e.variable),v);this.#store(frame,e.variable,result.value);this.#finish(result.result);});return;
      case 'random':one(e.bound,v=>this.#finish(this.#random.random(v)));return;
      case 'push':one(e.value,v=>{if(frame.operands.length>=this.#limits.operands)throw new Error('Operand stack budget exhausted');frame.operands.push(v);this.#finish(1);});return;
      case 'return-stack':{const value=frame.operands.pop();if(value===undefined)throw new Error('Operand stack underflow');this.#return(value);return;}
      case 'return':one(e.value,v=>this.#unwind(e.target,v));return;
      case 'again':this.#unwind(e.target);return;
      case 'verify':this.#finish(1);return;
      case 'and':case 'or':{
        if(values.length&&(e.op==='and'?values.at(-1)===0:values.at(-1)!==0)){this.#finish(values.at(-1)!);return;}
        if(values.length===e.args.length){this.#finish(values.at(-1) ?? (e.op==='and'?1:0));return;}
        this.#enqueueExpression(e.args[values.length]!);return;
      }
      case 'cond':{
        const clause=e.clauses[task.stage];if(!clause){this.#finish(0);return;}
        if(!values.length){this.#enqueueExpression(clause.test);return;}
        if(values[0]===0){task.stage++;task.values=[];return;}
        const command=clause.body[values.length-1];
        if(command)this.#enqueueExpression(command.expression);else this.#finish(values.at(-1)!);return;
      }
      case 'block':
        if(values.length){this.#finish(values[0]!);return;}
        if(task.stage)throw new Error('Missing block continuation');
        task.stage=1;frame.tasks.push({kind:'activation',expression:task.id,phase:'bindings',index:0,waiting:false,last:1,args:[]});return;
      case 'apply':case 'call':{
        const args=e.op==='apply'?[e.routine,...e.args]:e.args;
        if(values.length<args.length){this.#enqueueExpression(args[values.length]!);return;}
        if(task.stage){this.#finish(values.at(-1)!);return;}
        task.stage=1;
        const id=e.op==='call'?e.routine.id:values[0]!,passed=e.op==='call'?[...values]:values.slice(1);
        if(e.op==='apply'&&id===0){this.#finish(0);return;}
        const adapter=this.#game.bundle.payload.logic.adapter;
        if(adapter&&id===adapter.id){
          if(e.op!=='call'||this.#routine(frame).name!=='MAIN-LOOP-1')throw new Error('Parser adapter called outside MAIN-LOOP-1');
          if(this.#actor){
            if(this.#actor.phase==='tell'&&this.#world.global('P-CONT')){
              if(this.#world.global('P-CONT')!==5||!this.#world.global('QUOTE-FLAG')||this.#world.global('WINNER')!==this.#actor.plan.actor.id)throw new Error('Unsupported actor command continuation');
              this.#actor.phase='command';this.#pendingPlan=this.#actor.plan;
              this.#call(adapter.id,[],'parser-entry');return;
            }
            if(this.#world.global('P-CONT')&&(!this.#speech||this.#world.global('P-CONT')!==this.#speech.speech!.continuation||this.#world.global('QUOTE-FLAG')))throw new Error('Unsupported actor command continuation');
            this.#actor=null;
          }
          if(this.#speech){
            if(this.#world.global('P-CONT')){
              const speech=this.#speech,action=speech.action;
              if(action.kind!=='say'||this.#world.global('P-CONT')!==speech.speech!.continuation||this.#world.global('QUOTE-FLAG'))throw new Error('Unsupported spoken command continuation');
              if(speech.quoted){this.#quotedCommand=speech.quoted;this.#call(adapter.id,[],'parser-entry');return;}
              if(action.words.length!==1)throw new Error('Unsupported spoken command continuation');
              const token=speech.input.tokens[(speech.speech!.continuation-1)/2]!,dictionary=this.#game.bundle.payload.memory.words.find(w=>w.address===token.address);
              const word=this.#game.bundle.payload.vocabulary.words.find(w=>w.dictionaryIndex===dictionary?.dictionaryIndex);
              if(/^[0-9]+$/.test(token.text)||['AGAIN','G','OOPS','THEN','ALL','ONE','BUT','EXCEPT','INTNUM'].includes(word?.name ?? ''))throw new Error('Unsupported spoken command continuation');
              if(word?.roles.direction){
                const direction=this.#game.bundle.payload.vocabulary.directions.find(d=>d.number===word.roles.direction!.number);
                if(!direction)throw new Error('Unknown quoted direction');
                this.#quotedCommand=prepareAction(this.#game,this.#world,{kind:'walk',actor:'PLAYER',direction:direction.name});
                this.#call(adapter.id,[],'parser-entry');return;
              }
              const lexical=this.#game.bundle.payload.vocabulary.verbs.find(v=>v.number===word?.roles.verb?.number),row=lexical?.rows.find(r=>!r.slots.length);
              if(!token.address)this.#quotedError={kind:'unknown',clause:false};
              else if(!word?.roles.verb&&!word?.roles.direction&&!word?.roles.preposition){
                if(word?.name==='OF')this.#quotedError={kind:'cant-use',clause:false};
                else if(word?.roles.object)this.#quotedError={kind:'no-verb',clause:true};
                else if(word?.roles.adjective)this.#quotedError={kind:'cant-use',clause:true};
                else if(word?.roles.buzz)this.#quotedError={kind:'no-verb',clause:false};
              }
              if(this.#quotedError){this.#call(adapter.id,[],'parser-entry');return;}
              if(!lexical||!row||word?.roles.direction||['ANSWER','SAY','INCANT'].includes(row.action.name))throw new Error('Unsupported spoken command continuation');
              this.#quotedCommand=prepareAction(this.#game,this.#world,{kind:'act',actor:'PLAYER',verb:row.action.name,lexicalTable:lexical.name,syntax:row.id});
              this.#call(adapter.id,[],'parser-entry');return;
            }
            this.#speech=null;
          }
          if(this.#inputBoundary==='read'){this.#call(adapter.id,[],'parser-entry');return;}
          this.#wait={kind:'parser',routine:frame.routine,expression:task.id,args:passed};return;
        }
        this.#call(id,passed);return;
      }
      case 'primitive':case 'memory':case 'object':case 'output':case 'suspend':case 'unsupported-host':
        if(values.length<e.args.length){this.#enqueueExpression(e.args[values.length]!);return;}
        if(e.op==='suspend'&&e.operator==='READ'&&frame.program==='parser-entry'&&this.#pendingPlan){this.#world=writeReadText(this.#game,this.#world,values[0]!,values[1]!,this.#pendingPlan.input.text);this.#finish(1);return;}
        if(e.op==='suspend'){this.#wait={kind:e.operator,routine:frame.routine,expression:task.id,args:[...values]};return;}
        if(e.op==='unsupported-host')throw new Error('Unsupported host operation '+e.operator);
        this.#finish(e.op==='primitive'?numeric(e.operator,values):e.op==='memory'?this.#memory(e.operator,values):e.op==='object'?this.#object(e.operator,values):this.#print(e.operator,values));return;
      case 'untranslated':throw new Error('Untranslated operation '+e.construct);
    }
  }
  #populateAction(plan:ActionPlan,implicitTell=false):void {
    const world=this.#world;
    for(const key of ['P-NUMBER','P-NAM','P-ADJ','P-OFLAG','RESERVE-PTR','P-MERGED','P-GETFLAGS'])world.setGlobal(key,0);
    world.setGlobal('QUOTE-FLAG',0);world.setGlobal('P-NCN',plan.clauses.length);world.setGlobal('PRSA',plan.dispatch.action);world.setGlobal('P-DIR',0);world.setGlobal('P-LEN',plan.dispatch.kind==='walk'?0:65535);
    if(plan.dispatch.kind==='walk'){
      world.setGlobal('PRSO',plan.dispatch.direction);world.setGlobal('P-WALK-DIR',plan.dispatch.direction);world.setGlobal('AGAIN-DIR',plan.dispatch.direction);return;
    }
    world.setGlobal('P-WALK-DIR',0);world.setGlobal('AGAIN-DIR',0);world.setGlobal('P-SYNTAX',plan.dispatch.address);
    const table=world.global('P-ITBL'),verb=world.global('P-VTBL'),lex=world.global('P-LEXV');
    world.putWord(table,0,plan.dispatch.lexical);world.putWord(table,1,implicitTell?0:verb);
    if(!implicitTell){const token=plan.input.tokens[plan.actorPass?2:0]!;world.putWord(verb,0,token.address);world.putByte(verb,2,token.length);world.putByte(verb,3,token.offset);}
    if(plan.speech){world.setGlobal('P-CONT',plan.speech.continuation);world.setGlobal('P-LEN',plan.speech.remaining);world.setGlobal('P-DIR',0);world.setGlobal('QUOTE-FLAG',plan.actorPass?0:1);world.putByte(lex,1,plan.speech.remaining);}
    for(const clause of plan.clauses){world.putWord(table,2+2*clause.slot,clause.preposition);world.putWord(table,3+2*clause.slot,clause.word?plan.input.tokens[clause.start-1]!.address:0);world.putWord(table,6+2*clause.slot,lex+2+4*clause.start);world.putWord(table,7+2*clause.slot,lex+2+4*clause.end);}
  }
  #beginActorTell(plan:ActionPlan):void {
    if(plan.input.tokens[1]?.text!==',')throw new Error('Unsupported actor prefix spelling');
    const row=this.#game.bundle.payload.vocabulary.verbs.find(v=>v.name==='TELL')?.rows.find(r=>r.action.name==='TELL'&&r.slots.length===1&&!r.slots[0]!.preposition);
    if(!row)throw new Error('Missing actor TELL syntax');
    const tell=prepareAction(this.#game,this.#world,{kind:'act',actor:'PLAYER',verb:'TELL',lexicalTable:'TELL',syntax:row.id,prso:plan.actor.name});
    const projected:ActionPlan={...tell,input:plan.input,clauses:[{slot:0,preposition:0,word:null,start:0,end:1}]};
    this.#populateAction(projected,true);
    const remaining=plan.input.tokens.length-2,world=this.#world;
    world.putWord(world.global('P-LEXV')+6,0,this.#symbol('W?THEN'));world.putByte(world.global('P-LEXV'),1,remaining);
    world.setGlobal('P-CONT',5);world.setGlobal('P-LEN',remaining);world.setGlobal('QUOTE-FLAG',1);
    this.#beginScope(projected);
  }
  #symbol(name:string):number {
    const number=this.#game.bundle.payload.symbols.symbols.find(s=>s.name===name)?.number;
    if(number==null)throw new Error('Missing scope symbol '+name);return number;
  }
  #beginScope(plan:ActionPlan):void {
    const targets:ScopeSearch['targets']=[];
    // SNARF-OBJECTS resolves the indirect clause first.
    for(const [selection,slot] of [[plan.indirect,1],[plan.direct,0]] as const){
      if(!selection)continue;
      const clause=plan.clauses.find(c=>c.slot===slot)!;
      if(selection.kind==='all')targets.push({operand:null,slot,noun:0,adjective:0,adjectiveWord:null,updateOne:false,first:true,multiple:false});
      else {
        let token=clause.start;
        for(const [i,operand] of selection.objects.entries()){
          const noun=plan.input.tokens[token+operand.words.length-1]!.address;
          // SNARF-OBJECTS prefers an adjective role; GET-OBJECT then promotes a
          // lone adjective/noun word to P-NAM without updating P-ONEOBJ.
          const promoted=!operand.adjective&&this.#game.bundle.payload.vocabulary.words.find(w=>w.name===operand.words.at(-1))?.roles.adjective;
          targets.push({operand,slot,noun,adjective:operand.adjective ?? 0,adjectiveWord:operand.adjective?plan.input.tokens[token]!.address:promoted?noun:null,updateOne:!promoted,first:i===0,multiple:selection.objects.length>1});
          token+=operand.words.length+1;
        }
      }
    }
    if(!targets.length){this.#call(this.#game.bundle.payload.logic.adapter!.id,[],'parser-checks');return;}
    this.#scope={plan,targets,index:0,base:0,phase:'inventory',retry:false,depth:this.#frames.length};
    this.#startScope();
  }
  #startScope():void {
    const scope=this.#scope!,world=this.#world,target=scope.targets[scope.index]!;
    if(target.operand?.pseudo&&target.operand.pseudo.room!==world.global('HERE'))throw new Error('Pseudo feature is outside its declared room');
    world.setGlobal('P-NAM',target.noun);world.setGlobal('P-ADJ',target.adjective);world.setGlobal('P-GWIMBIT',0);
    if(target.adjectiveWord!==null)world.setGlobal('P-ADJN',target.adjectiveWord);
    world.setGlobal('P-GETFLAGS',target.operand?0:this.#symbol('P-ALL'));world.setGlobal('P-AND',target.multiple?1:0);
    if(target.updateOne)world.setGlobal('P-ONEOBJ',target.noun);
    const table=world.global(target.slot===0?'P-PRSO':'P-PRSI');
    if(!scope.retry)scope.base=target.first?0:world.getWord(table);
    world.setGlobal('P-TABLE',table);world.putWord(table,0,scope.base);
    const bits=world.getByte(world.global('P-SYNTAX'),5+target.slot);
    world.setGlobal('P-SLOCBITS',scope.retry||!target.operand&&bits!==0?bits:65535);
    if(world.global('LIT')){
      scope.phase='room';world.setFlag(world.global('PLAYER'),this.#symbol('TRANSBIT'),false);
      this.#call(this.#symbol('DO-SL'),[world.global('HERE'),16,32]);
    }else {scope.phase='inventory';this.#call(this.#symbol('DO-SL'),[world.global('PLAYER'),128,64]);}
  }
  #advanceScope():void {
    const scope=this.#scope!,world=this.#world;
    if(scope.phase==='room'){
      world.setFlag(world.global('PLAYER'),this.#symbol('TRANSBIT'));scope.phase='inventory';
      this.#call(this.#symbol('DO-SL'),[world.global('PLAYER'),128,64]);return;
    }
    const count=world.getWord(world.global('P-TABLE'))-scope.base,target=scope.targets[scope.index]!;
    if(count===0&&scope.phase!=='global'&&!scope.retry){
      scope.phase='global';this.#call(this.#symbol('GLOBAL-CHECK'),[world.global('P-TABLE')]);return;
    }
    if(target.operand&&count>1&&!scope.retry&&scope.phase!=='global'){scope.retry=true;this.#startScope();return;}
    if(count===0&&!scope.retry&&!target.operand?.pseudo){
      world.setGlobal('P-SLOCBITS',world.getByte(world.global('P-SYNTAX'),5+target.slot));
      this.#call(this.#game.bundle.payload.logic.adapter!.notHere.id,[world.global('P-TABLE')],'parser-not-here');return;
    }
    if(target.operand?(count!==1||world.getWord(world.global('P-TABLE'),scope.base+1)!==target.operand.id):count===0)throw new Error('Operand is outside supported scope or has an ambiguous noun');
    if(target.operand?.pseudo){
      const pseudo=target.operand.pseudo,action=this.#symbol('P?ACTION'),name=world.propertyAddress(target.operand.id,action)-5;
      if(scope.phase!=='global'||world.getProperty(target.operand.id,action)!==pseudo.routine||world.getWord(name)!==world.getWord(target.noun)||world.getWord(name,1)!==world.getWord(target.noun,1))throw new Error('Pseudo feature binding does not match the selected source feature');
    }
    this.#finishScopeTarget();
  }
  #finishScopeTarget():void {
    const scope=this.#scope!,world=this.#world,target=scope.targets[scope.index]!;
    world.setGlobal('P-SLOCBITS',world.getByte(world.global('P-SYNTAX'),5+target.slot));
    if(++scope.index<scope.targets.length){scope.retry=false;this.#startScope();return;}
    world.setGlobal('P-NAM',0);world.setGlobal('P-ADJ',0);world.setGlobal('P-GWIMBIT',0);
    world.setGlobal('P-GETFLAGS',[scope.plan.direct,scope.plan.indirect].some(s=>s?.kind==='all')?this.#symbol('P-ALL'):0);
    this.#scope=null;this.#call(this.#game.bundle.payload.logic.adapter!.id,[],'parser-checks');
  }
  #validateContinuation():void {
    const fail=():never=>{throw new Error('Invalid interpreter continuation');};
    if(this.#steps>this.#limits.steps||this.#output>this.#limits.output||this.#frames.length>this.#limits.depth)fail();
    if(this.#result!==null){if(this.#frames.length||this.#wait)fail();return;}
    if(!this.#frames.length)fail();
    for(const [frameIndex,frame] of this.#frames.entries()){
      const routine=this.#routine(frame);
      if(frameIndex>0&&frame.program!=='runtime'){const caller=this.#frames[frameIndex-1]!;if(this.#routine(caller).name!=='MAIN-LOOP-1'||!['parser-entry','parser-checks','parser-no-verb','parser-not-here'].includes(frame.program))fail();}
      if(frame.locals.length!==routine.slotCount+1||frame.locals[0]!==0||frame.operands.length>this.#limits.operands||!frame.tasks.length)fail();
      const argsFor=(e:LogicExpression):LogicExpression[]=>{
        switch(e.op){
          case 'store':case 'push':case 'return':return [e.value];
          case 'value':return [e.variable];case 'random':case 'update-compare':return [e.bound];
          case 'primitive':case 'memory':case 'object':case 'output':case 'suspend':case 'unsupported-host':case 'call':case 'and':case 'or':return e.args;
          case 'apply':return [e.routine,...e.args];default:return [];
        }
      };
      const childOf=(parent:Task):LogicExpression|undefined=>{
        if(parent.kind==='activation'){
          if(!parent.waiting)return;
          const a=this.#activation(frame,parent);
          return parent.phase==='bindings'?a.bindings[parent.index]?.initializer ?? undefined:a.body[parent.index]?.expression;
        }
        const e=this.#expression(frame,parent.id),values=parent.values;
        if(e.op==='cond'){
          const clause=e.clauses[parent.stage];if(!clause)return;
          return values.length?values[0]?clause.body[values.length-1]?.expression:undefined:clause.test;
        }
        if((e.op==='and'&&values.at(-1)===0)||(e.op==='or'&&values.length&&values.at(-1)!==0))return;
        return argsFor(e)[values.length];
      };
      for(const [index,task] of frame.tasks.entries()){
        const parent=frame.tasks[index-1];
        if(task.kind==='activation'){
          const activation=this.#activation(frame,task);
          if(task.expression===null){
            if(index!==0||task.args.length<routine.required||task.args.length>routine.required+routine.optional)fail();
          }else {
            if(task.args.length||parent?.kind!=='expression'||parent.id!==task.expression||parent.stage!==1||parent.values.length)fail();
          }
          if(task.index>(task.phase==='bindings'?activation.bindings.length:activation.body.length))fail();
          if(task.waiting&&!frame.tasks[index+1])fail();
        }else {
          const e=this.#expression(frame,task.id),args=argsFor(e),size=task.values.length;
          if(!parent||this.#indices.get(childOf(parent)!)!==task.id)fail();
          if(e.op==='cond'){
            const clause=e.clauses[task.stage];if(task.stage>e.clauses.length||size>(clause?1+clause.body.length:0))fail();
          }else if(e.op==='block'){
            if(task.stage>1||size>task.stage)fail();
          }else if(e.op==='call'||e.op==='apply'){
            if(task.stage>1||size>args.length+task.stage||task.stage===1&&size<args.length)fail();
          }else if(task.stage!==0||size>args.length)fail();
        }
      }
      if(frameIndex<this.#frames.length-1){
        const caller=frame.tasks.at(-1)!;
        if(caller.kind!=='expression')fail();
        const call=caller as ExpressionTask,e=this.#expression(frame,call.id);
        if(e.op!=='call'&&e.op!=='apply')fail();
        const expression=e as Extract<LogicExpression,{op:'call'|'apply'}>,args=argsFor(expression);
        if(call.stage!==1||call.values.length!==args.length)fail();
        const target=expression.op==='call'?expression.routine.id:call.values[0],passed=expression.op==='call'?call.values:call.values.slice(1),next=this.#frames[frameIndex+1]!;
        const activation=next.tasks[0];
        if(next.routine!==target||activation?.kind!=='activation'||canonicalJson(activation.args)!==canonicalJson(passed))fail();
      }
    }
    const leaf=this.#frames.at(-1)!,top=leaf.tasks.at(-1)!;
    if(top.kind==='expression'){
      const expression=this.#expression(leaf,top.id);
      if(expression.op==='block'&&top.stage===1&&top.values.length===0)fail();
      if((expression.op==='call'||expression.op==='apply')&&top.stage===1&&top.values.length===expression.args.length+(expression.op==='apply'?1:0)&&this.#wait?.kind!=='parser')fail();
    }
    if(this.#wait){
      const frame=this.#frames.at(-1)!,task=frame.tasks.at(-1)!;
      if(task.kind!=='expression'||task.id!==this.#wait.expression||frame.routine!==this.#wait.routine)fail();
      const expression=this.#expression(frame,(task as ExpressionTask).id),values=(task as ExpressionTask).values;
      if(this.#wait.kind==='parser'){
        if(expression.op!=='call'||expression.routine.id!==this.#game.bundle.payload.logic.adapter?.id||this.#routine(frame).name!=='MAIN-LOOP-1'||(task as ExpressionTask).stage!==1)fail();
      }else if(expression.op!=='suspend'||expression.operator!==this.#wait.kind)fail();
      if(!('args' in expression)||values.length!==expression.args.length||canonicalJson(values)!==canonicalJson(this.#wait.args))fail();
    }
  }
  #memory(operator:string,a:readonly number[]):number {
    const [base,index=1,value]=a as [number,number?,number?],offset=signed(index);
    switch(operator){
      case 'GET':return this.#world.getWord(base,offset);case 'GETB':return this.#world.getByte(base,offset);
      case 'PUT':return this.#world.putWord(base,offset,value!);case 'PUTB':return this.#world.putByte(base,offset,value!);
      case 'REST':return this.#world.rest(base,offset);case 'BACK':return this.#world.back(base,offset);
      default:throw new Error('Unknown memory operation '+operator);
    }
  }
  #object(operator:string,a:readonly number[]):number {
    const [id,n,value]=a as [number,number?,number?];
    switch(operator){
      case 'LOC':return this.#world.parent(id);case 'FIRST?':return this.#world.firstChild(id);case 'NEXT?':return this.#world.nextSibling(id);case 'IN?':return this.#world.in(id,n!)?1:0;
      case 'MOVE':return this.#world.move(id,n!);case 'REMOVE':return this.#world.remove(id);
      case 'FSET':return this.#world.setFlag(id,n!);case 'FCLEAR':return this.#world.setFlag(id,n!,false);case 'FSET?':return this.#world.hasFlag(id,n!)?1:0;
      case 'GETP':return this.#world.getProperty(id,n!);case 'PUTP':return this.#world.putProperty(id,n!,value!);case 'GETPT':return this.#world.propertyAddress(id,n!);case 'PTSIZE':return this.#world.propertySize(id);case 'NEXTP':return this.#world.nextProperty(id,n!);
      default:throw new Error('Unknown object operation '+operator);
    }
  }
  #print(operator:string,a:readonly number[]):1 {
    const value=a[0]!,read=(address:number)=>this.#world.getByte(address);
    let text:string;
    switch(operator){
      case 'PRINT':case 'PRINTI':{
        const string=this.#game.bundle.payload.strings.entries.find(s=>s.id===value);if(!string)throw new Error('Unknown string handle '+value);text=string.text;break;
      }
      case 'PRINTN':text=String(signed(value));break;
      case 'CRLF':text='\n';break;
      case 'PRINTC':
        if(value===13)text='\n';else if(value===9)text='\t';else if(value===0)text='';else if(value>=32&&value<=126)text=String.fromCharCode(value);else throw new Error('Unsupported output character '+value);break;
      case 'PRINTD':{
        const object=this.#game.bundle.payload.memory.objects.find(o=>o.id===value);if(!object)throw new Error('Unknown object '+value);
        const base=this.#world.getWord(object.address+7);text=decodeZText(read,base+1,read(base));break;
      }
      case 'PRINTB':{
        if(!this.#game.bundle.payload.memory.words.some(w=>w.address===value))throw new Error('PRINTB requires a dictionary word address');
        text=decodeZText(read,value,2);break;
      }
      default:throw new Error('Unknown output operation '+operator);
    }
    if(this.#output+text.length>this.#limits.output)throw new Error('Interpreter output budget exhausted');
    this.#output+=text.length;this.#text.push(text);return 1;
  }
}
function structuredFrames(frames:readonly Frame[]):Frame[]{return frames.map(f=>({...f,locals:[...f.locals],operands:[...f.operands],tasks:f.tasks.map(t=>t.kind==='expression'?{...t,values:[...t.values]}:{...t,args:[...t.args]})}));}
function copyWait(wait:InterpreterWait|null):InterpreterWait|null{return wait?{...wait,args:[...wait.args]}:null;}

import type { Span, MacroOrigin } from '../zil/ast.ts';
import type { ExecutionProgram } from './interpreter.ts';
import { canonicalJson } from '../zil/integrity.ts';

/** Internal capabilities. The player API neither exports these symbols nor accepts
 * a JSON reveal/trace flag. Test tools opt in via engine/testing.ts. */
export const DIAGNOSTICS=Symbol('execution diagnostics');
export const SESSION_DEBUG=Symbol('session debug access');
export interface TraceOptions {maxEntries?:number;maxAttempts?:number}
export interface TraceSite {
  source:Span;sourceMapId?:string;nodeId?:string;origin?:MacroOrigin[];
}
export interface TraceFrame {program:ExecutionProgram;routine:number;name:string;source:Span}
export interface TraceEntry extends TraceSite {
  kind:'command'|'binding'|'expression'|'resume';operation:string;
  program:ExecutionProgram;routine:number;name:string;depth:number;step:number;
}
export interface TraceAttempt {
  id:number;input:'run'|'action'|'decision'|'parser-text'|'host';
  status:'returned'|'suspended'|'error';entries:TraceEntry[];droppedEntries:number;
  error?:{cause:string;source:Span|null;stack:TraceFrame[]};
}
export interface ExecutionTrace {format:'zxr-execution-trace-v1';attempts:TraceAttempt[];droppedAttempts:number}
const own=<T>(value:T):T=>JSON.parse(canonicalJson(value)) as T;
/** Bounded diagnostic history, deliberately outside snapshots and transaction state.
 * Retains failed attempted work, but invokes no user callbacks or host services. */
export class ExecutionDiagnostics {
  readonly #maxEntries:number;readonly #maxAttempts:number;
  #attempts:TraceAttempt[]=[];#active:Omit<TraceAttempt,'status'>|null=null;
  #start=0;#serial=0;#droppedAttempts=0;
  constructor(options:TraceOptions={}) {
    this.#maxEntries=options.maxEntries??4096;this.#maxAttempts=options.maxAttempts??4;
    for(const [name,value,max] of [['maxEntries',this.#maxEntries,65536],['maxAttempts',this.#maxAttempts,16]] as const)
      if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error('Invalid trace limit '+name);
  }
  begin(input:TraceAttempt['input']):void {
    this.#active={id:this.#serial=Math.min(this.#serial+1,Number.MAX_SAFE_INTEGER),input,entries:[],droppedEntries:0};this.#start=0;
  }
  record(entry:TraceEntry):void {
    const active=this.#active;if(!active)return;
    // Copy only retained sites. IR/source-map data are immutable in LoadedGame.
    if(active.entries.length<this.#maxEntries)active.entries.push(entry);
    else {active.entries[this.#start]=entry;this.#start=(this.#start+1)%this.#maxEntries;active.droppedEntries++;}
  }
  end(status:TraceAttempt['status'],error?:TraceAttempt['error']):void {
    const active=this.#active;if(!active)return;
    const entries=active.entries.slice(this.#start).concat(active.entries.slice(0,this.#start));
    this.#attempts.push({...active,entries,status,...(error?{error}:{})});
    if(this.#attempts.length>this.#maxAttempts){this.#attempts.shift();this.#droppedAttempts=Math.min(this.#droppedAttempts+1,Number.MAX_SAFE_INTEGER);}
    this.#active=null;
  }
  trace():ExecutionTrace {return own({format:'zxr-execution-trace-v1',attempts:this.#attempts,droppedAttempts:this.#droppedAttempts});}
  clear():void {this.#attempts=[];this.#droppedAttempts=0;}
}

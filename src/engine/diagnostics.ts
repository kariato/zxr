import type { Span, MacroOrigin } from '../zil/ast.ts';
import type { WorldSnapshot } from './world-state.ts';
import type { ExecutionProgram } from './interpreter.ts';
import { canonicalJson } from '../zil/integrity.ts';

/** Internal capabilities. The player API neither exports these symbols nor accepts
 * a JSON reveal/trace flag. Test tools opt in via engine/testing.ts. */
export const DIAGNOSTICS=Symbol('execution diagnostics');
export const SESSION_DEBUG=Symbol('session debug access');
export const SESSION_VALIDATE=Symbol('session invariant validation');
/** Tool-only inputs for original debug commands and invalid decision regression cases. */
export const DIAGNOSTIC_INPUT=Symbol('diagnostic input');
export const DIAGNOSTIC_NUMBER=Symbol('diagnostic numeric operand');
export interface TraceOptions {maxEntries?:number;maxAttempts?:number;captureBoundaries?:boolean;operations?:readonly string[]}
export interface TraceBoundary {kind:'parser-return'|'action-complete';world:WorldSnapshot;source:Span;rngCursor:number}
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
  boundaries?:TraceBoundary[];droppedBoundaries?:number;
  error?:{cause:string;source:Span|null;stack:TraceFrame[]};
}
export interface ExecutionTrace {format:'zxr-execution-trace-v1';operations?:string[];attempts:TraceAttempt[];droppedAttempts:number}
const own=<T>(value:T):T=>JSON.parse(canonicalJson(value)) as T;
/** Bounded diagnostic history, deliberately outside snapshots and transaction state.
 * Retains failed attempted work, but invokes no user callbacks or host services. */
export class ExecutionDiagnostics {
  readonly #captureBoundaries:boolean;readonly #operations:Set<string>|undefined;
  readonly #maxEntries:number;readonly #maxAttempts:number;
  #attempts:TraceAttempt[]=[];#active:Omit<TraceAttempt,'status'>|null=null;
  #start=0;#serial=0;#droppedAttempts=0;
  constructor(options:TraceOptions={}) {
    if(options.operations&&(!Array.isArray(options.operations)||!options.operations.length||options.operations.length>128||options.operations.some(op=>typeof op!=='string'||!op.length)))throw new Error('Invalid trace operation filter');
    this.#operations=options.operations?new Set(options.operations):undefined;
    this.#captureBoundaries=options.captureBoundaries??false;
    this.#maxEntries=options.maxEntries??4096;this.#maxAttempts=options.maxAttempts??4;
    for(const [name,value,max] of [['maxEntries',this.#maxEntries,65536],['maxAttempts',this.#maxAttempts,16]] as const)
      if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error('Invalid trace limit '+name);
  }
  begin(input:TraceAttempt['input']):void {
    this.#active={id:this.#serial=Math.min(this.#serial+1,Number.MAX_SAFE_INTEGER),input,entries:[],droppedEntries:0,...(this.#captureBoundaries?{boundaries:[],droppedBoundaries:0}: {})};this.#start=0;
  }
  boundary(kind:TraceBoundary['kind'],world:()=>WorldSnapshot,source:Span,rngCursor:number):void {
    const boundaries=this.#active?.boundaries;if(!boundaries)return;
    if(boundaries.length>=256){this.#active!.droppedBoundaries=Math.min((this.#active!.droppedBoundaries??0)+1,Number.MAX_SAFE_INTEGER);return;}
    boundaries.push({kind,world:world(),source,rngCursor});
  }
  accepts(operation:string):boolean {return !this.#operations||this.#operations.has(operation);}
  record(entry:TraceEntry):void {
    const active=this.#active;if(!active||this.#operations&&!this.#operations.has(entry.operation))return;
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
  trace():ExecutionTrace {return own({format:'zxr-execution-trace-v1',...(this.#operations?{operations:[...this.#operations]}:{}),attempts:this.#attempts,droppedAttempts:this.#droppedAttempts});}
  clear():void {this.#attempts=[];this.#droppedAttempts=0;}
}

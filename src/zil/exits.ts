import { atomName } from './ast.ts';
import type { Node, Sequence, Span } from './ast.ts';
import { ZilError } from './diagnostics.ts';
import { print } from './printer.ts';
import { decodeZilText } from './text.ts';
import type { SymbolAnalysis, SymbolDefinition } from './symbols.ts';

export type ExitRelocation = {kind:'string';offset:number;text:string}|{kind:'routine';offset:number;name:string;id:number};
export interface EncodedExit {
  property:{name:string;number:number};byteLength:number;bytes:number[];
  relocations:ExitRelocation[];declaration:string;source:Span;
}
export type ExitView =
  | {kind:'UEXIT';to:string}
  | {kind:'NEXIT';message:string}
  | {kind:'FEXIT';routine:string}
  | {kind:'CEXIT';to:string;global:string;message:string|null}
  | {kind:'DEXIT';to:string;door:string;message:string|null};
export interface WorldExit extends EncodedExit { view:ExitView }
const layouts={UEXIT:1,NEXIT:2,FEXIT:3,CEXIT:4,DEXIT:5,REXIT:0,NEXITSTR:0,FEXITFCN:0,CEXITFLAG:1,CEXITSTR:1,DEXITOBJ:1,DEXITSTR:1};

/** Property payloads only; string handles are linked with the shared pool in step 2.7. */
export function encodeExit(node:Sequence,analysis:SymbolAnalysis):EncodedExit {
  const fail=(message:string,site:Node=node):never=>{throw new ZilError('ZIL007',message,site.span);};
  const symbols=new Map(analysis.symbols.map(s=>[s.name,s]));
  for(const [name,expected] of Object.entries(layouts)){
    const actual=symbols.get(name)?.number;if(actual!==undefined&&actual!==expected)fail(`Incompatible exit layout ${name}: ${actual}, expected ${expected}`);
  }
  const lookup=(n:Node|undefined,kinds:SymbolDefinition['kind'][],prefix=''):SymbolDefinition=>{
    const atom=atomName(n),name=atom?prefix+atom:undefined,s=name?symbols.get(name):undefined;
    if(!s||!kinds.includes(s.kind)||s.number===null)return fail(`Expected exit ${kinds.join('/')} ${name ?? ''}`,n ?? node);return s;
  };
  const p=lookup(node.items[0],['property'],'P?'),args=node.items.slice(1),relocations:ExitRelocation[]=[];
  if(p.number! < (symbols.get('LOW-DIRECTION')?.number ?? 18))fail('Expected a direction property');
  let bytes:number[];
  const message=(n:Node|undefined,offset:number)=>{
    if(n?.kind!=='string')return fail('Expected an exit message string',n ?? node);
    relocations.push({kind:'string',offset,text:decodeZilText(n.value)});
  };
  if(args[0]?.kind==='string'){
    if(args.length!==1)fail('Blocked exit requires exactly one string');bytes=[0,0];message(args[0],0);
  } else if(atomName(args[0])==='PER'){
    if(args.length!==2)fail('Routine exit requires PER and one routine');
    const r=lookup(args[1],['routine']),id=r.number!;bytes=[id>>>8,id&255,0];relocations.push({kind:'routine',offset:0,name:r.name,id});
  } else {
    if(atomName(args[0])!=='TO')fail('Exit requires TO, PER or a string');
    const target=lookup(args[1],['room','object']);
    if(target.kind!=='room'&&target.name!=='ROOMS')fail('Exit destination must be a room or the ROOMS root',args[1]);
    if(args.length===2)bytes=[target.number!];
    else {
      if(atomName(args[2])!=='IF')fail('Conditional exit requires IF',args[2]);
      const door=atomName(args[4])==='IS',condition=lookup(args[3],door?['object']:['global']);
      if(door&&atomName(args[5])!=='OPEN')fail('Door exit requires IS OPEN',args[5]);
      const offset=door?6:4;
      if(args.length!==offset&&!(args.length===offset+2&&atomName(args[offset])==='ELSE'))fail('Invalid conditional exit ELSE clause');
      bytes=[target.number!,condition.number!,0,0,...(door?[0]:[])];
      if(args.length>offset)message(args[offset+1],2);
    }
  }
  if(bytes.some(b=>!Number.isInteger(b)||b<0||b>255))fail('Exit field exceeds one byte');
  return {property:{name:p.name.slice(2),number:p.number!},byteLength:bytes.length,bytes,relocations,declaration:print(node),source:node.span};
}

/** Decode the payload, not the source clause. No routines are executed to infer destinations. */
export function decodeExit(exit:EncodedExit,analysis:SymbolAnalysis):ExitView {
  const fail=(message:string):never=>{throw new ZilError('ZIL007',message,exit.source);};
  const b=exit.bytes,length=b.length;
  if(length!==exit.byteLength||length<1||length>5||b.some(v=>!Number.isInteger(v)||v<0||v>255))fail('Invalid exit byte payload');
  const lookup=(number:number,kinds:SymbolDefinition['kind'][]):string=>{
    const s=analysis.symbols.find(s=>s.number===number&&kinds.includes(s.kind));
    if(!s)return fail(`Dangling exit ${kinds.join('/')} number ${number}`);return s.name;
  };
  const destination=()=>{
    const name=lookup(b[0]!,['room','object']);
    if(name!=='ROOMS'&&!analysis.symbols.some(s=>s.name===name&&s.kind==='room'))fail(`Exit destination ${name} is not a room`);return name;
  };
  const stringOffset=length===2?0:length>=4?2:-1;
  const seen=new Set<number>();
  for(const r of exit.relocations){
    if(seen.has(r.offset))fail('Overlapping exit relocations');seen.add(r.offset);
    if(r.kind==='string'){
      if(r.offset!==stringOffset||typeof r.text!=='string'||b[r.offset]!==0||b[r.offset+1]!==0)fail('Invalid exit string relocation');
    } else if(length!==3||r.offset!==0||r.id!==(b[0]!<<8|b[1]!)||lookup(r.id,['routine'])!==r.name)fail('Invalid exit routine relocation');
  }
  const message=():string|null=>{
    const r=exit.relocations.find(r=>r.kind==='string');
    if(r?.kind==='string')return r.text;
    if(stringOffset>=0&&(b[stringOffset]!==0||b[stringOffset+1]!==0))fail('Unresolved exit string handle');return null;
  };
  if(length===1)return {kind:'UEXIT',to:destination()};
  if(length===2){const text=message();if(text===null)fail('Blocked exit requires a string relocation');return {kind:'NEXIT',message:text!};}
  if(length===3){if(b[2]!==0||exit.relocations.length!==1||exit.relocations[0]?.kind!=='routine')fail('Invalid routine exit padding/relocation');return {kind:'FEXIT',routine:lookup(b[0]!<<8|b[1]!,['routine'])};}
  if(length===4)return {kind:'CEXIT',to:destination(),global:lookup(b[1]!,['global']),message:message()};
  if(b[4]!==0)fail('Invalid door exit padding');
  return {kind:'DEXIT',to:destination(),door:lookup(b[1]!,['object']),message:message()};
}

/** Materialize relocation words without changing the compiler payload (big-endian). */
export function linkExit(exit:EncodedExit,resolveString:(text:string)=>number,resolveRoutine:(name:string,id:number)=>number=(_name,id)=>id):number[] {
  const bytes=[...exit.bytes],used=new Set<number>();
  for(const r of exit.relocations){
    if(!Number.isInteger(r.offset)||r.offset<0||r.offset+1>=bytes.length||used.has(r.offset)||used.has(r.offset+1))throw new ZilError('ZIL007','Invalid exit relocation offset',exit.source);
    used.add(r.offset);used.add(r.offset+1);
    const value=r.kind==='string'?resolveString(r.text):resolveRoutine(r.name,r.id);
    if(!Number.isInteger(value)||value<1||value>65535)throw new ZilError('ZIL007','Exit relocation requires a nonzero 16-bit value',exit.source);
    bytes[r.offset]=value>>>8;bytes[r.offset+1]=value&255;
  }
  return bytes;
}

/** Includes blocked/routine exits and the special ROOMS object's IN property. */
export function deriveExitGraph(entities:readonly {name:string;exits:readonly EncodedExit[]}[],analysis:SymbolAnalysis) {
  const names=new Set(entities.map(e=>e.name));
  return entities.flatMap(e=>e.exits.map(exit=>{
    const view=decodeExit(exit,analysis);
    if('to' in view&&!names.has(view.to))throw new ZilError('ZIL007',`Dangling exit destination ${view.to}`,exit.source);
    return {from:e.name,direction:exit.property.name,...view};
  }));
}

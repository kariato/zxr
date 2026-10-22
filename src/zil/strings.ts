import { atomName, head } from './ast.ts';
import type { Node, Sequence, Span } from './ast.ts';
import { decodeZilText } from './text.ts';
import { ZilError } from './diagnostics.ts';

export interface StringEntry {id:number;text:string}
export interface StringPool {format:'zxr-strings-v1';entries:StringEntry[]}
export interface StringLiteral {owner:string;kind:'routine'|'global'|'property'|'exit';text:string;source:Span}

/** Only runtime text: exclude DECL, binding section markers, word spellings and short names. */
export function* runtimeStrings(forms:readonly Node[]):Generator<StringLiteral> {
  function* expression(n:Node,owner:string,kind:StringLiteral['kind']):Generator<StringLiteral>{
    if(n.kind==='string'){yield {owner,kind,text:decodeZilText(n.value),source:n.span};return;}
    if(n.kind==='typed'&&atomName(n.tag)==='DECL')return;
    if(n.kind==='form'&&['PROG','REPEAT'].includes(head(n) ?? '')){
      yield* bindings(n.items[1],owner,kind);for(const body of n.items.slice(2))yield* expression(body,owner,kind);return;
    }
    if(n.kind==='form'||n.kind==='list'||n.kind==='vector')for(const c of n.items)yield* expression(c,owner,kind);
    else if(n.kind==='prefix')yield* expression(n.value,owner,kind);
    else if(n.kind==='typed')yield* expression(n.value,owner,kind);
  }
  function* bindings(n:Node|undefined,owner:string,kind:StringLiteral['kind']):Generator<StringLiteral>{
    if(n?.kind!=='list')return;
    for(const b of n.items)if(b.kind==='list'&&b.items[1])yield* expression(b.items[1],owner,kind);
  }
  for(const n of forms){
    const op=head(n);if(!op)continue;const f=n as Sequence,owner=atomName(f.items[1]) ?? '<anonymous>';
    if(op==='ROUTINE'){
      yield* bindings(f.items[2],owner,'routine');for(const body of f.items.slice(3))yield* expression(body,owner,'routine');
    } else if(op==='GLOBAL'||op==='CONSTANT'){
      for(const value of f.items.slice(2))yield* expression(value,owner,'global');
    } else if(op==='ROOM'||op==='OBJECT')for(const p of f.items.slice(2))if(p.kind==='list'){
      const key=atomName(p.items[0]);
      if(['LDESC','FDESC','TEXT'].includes(key ?? ''))for(const value of p.items.slice(1))yield* expression(value,owner,'property');
      // Exit message strings are the only remaining direct strings in property lists.
      else if(!['DESC','SYNONYM','ADJECTIVE','PSEUDO'].includes(key ?? ''))for(const value of p.items.slice(1))if(value.kind==='string')yield* expression(value,owner,'exit');
    }
  }
}
export function compileStringPool(forms:readonly Node[]):StringPool {
  const entries:StringEntry[]=[],known=new Set<string>();
  for(const s of runtimeStrings(forms))if(!known.has(s.text)){
    if(entries.length===65535)throw new ZilError('ZIL010','String pool exceeds 65535 nonzero handles',s.source);
    entries.push({id:entries.length+1,text:s.text});known.add(s.text);
  }
  return {format:'zxr-strings-v1',entries};
}
export function validateStringPool(pool:StringPool):void {
  if(pool.format!=='zxr-strings-v1'||pool.entries.length>65535)throw new Error('Invalid string pool format/size');
  const seen=new Set<string>();for(const [i,e] of pool.entries.entries()){
    if(e.id!==i+1||typeof e.text!=='string'||seen.has(e.text))throw new Error('Invalid string pool numbering/text');seen.add(e.text);
  }
}

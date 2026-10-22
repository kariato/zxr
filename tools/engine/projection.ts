import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { LoadedGame, WorldState } from '../../src/engine/index.ts';
import { decodeZText } from '../../src/engine/index.ts';
import type { MemoryField } from '../../src/zil/index.ts';
import { canonicalJson } from '../../src/zil/integrity.ts';
import { parserBufferGlobals, protocolGlobals, scratchGroups } from '../zil/semantics-contract.ts';
import { loadSymbols, STORY } from '../reference/symbols.ts';
const symbols=loadSymbols(),story=readFileSync(STORY),globalBase=story.readUInt16BE(12),objectBase=story.readUInt16BE(10)+62;
const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js');
export type SemanticProjection=Record<string,unknown>;
const excluded=new Set<string>([...parserBufferGlobals,...protocolGlobals,...scratchGroups.flatMap(g=>g.names)]);
interface Field {key:string;own:number;reference:number;width:number;domain:string;target?:string}
/** Typed, address-independent comparison. Every non-parser gameplay allocation is
 * covered; domains come from field schemas and reviewed dynamic globals, never a
 * value-range guess. The reference decoder is independent of ZXR's text decoder. */
export function createProjection(game:LoadedGame) {
  const layout=game.bundle.payload.memory,fields:Field[]=[],bases=new Map<string,{own:number;reference:number;length:number}>();
  const originalGlobal=(name:string)=>{const n=symbols.globals.indexOf(name);if(n<0)throw new Error('Unmapped reference global '+name);return story.readUInt16BE(globalBase+2*n);};
  const addBase=(name:string,reference:number)=>{const segment=layout.segments.find(s=>s.name===name);if(!segment)throw new Error('Unmapped segment '+name);bases.set(name,{own:segment.base,reference,length:segment.length});};
  for(const name of ['dictionary','globals','objects'])addBase(name,story.readUInt16BE(name==='dictionary'?8:name==='globals'?12:10));
  for(const [name,global] of [['actions','ACTIONS'],['preactions','PREACTIONS'],['verbs','VERBS'],['prepositions','PREPOSITIONS']] as const)addBase(name,originalGlobal(global));
  for(const table of layout.tables)addBase(table.name,originalGlobal(table.owner));
  const referenceProperties=new Map<number,Map<number,{address:number;length:number}>>();
  for(const object of layout.objects){
    const reference=story.readUInt16BE(objectBase+9*(object.id-1)+7);addBase('properties:'+object.name,reference);
    let cursor=reference+1+2*story[reference]!;const props=new Map<number,{address:number;length:number}>();
    while(story[cursor]){const header=story[cursor++]!,length=(header>>>5)+1;props.set(header&31,{address:cursor,length});cursor+=length;}referenceProperties.set(object.id,props);
  }
  const add=(key:string,field:MemoryField,ownBase:number,referenceBase:number,domain=field.domain)=>{
    fields.push({key,own:ownBase+field.offset,reference:referenceBase+field.offset,width:field.width,domain,...(field.target?{target:field.target}:{})});
  };
  const globalSegment=layout.segments.find(s=>s.name==='globals')!;
  for(const global of layout.globals){
    if(excluded.has(global.name))continue;
    const field=globalSegment.fields.find(f=>f.offset===global.address-globalSegment.base)!;
    // These zero-initialized globals carry dictionary addresses after parsing.
    const domain=['P-NAM','P-ONEOBJ','SPELL-USED'].includes(global.name)?'dictionary':field.domain;
    add('global.'+global.name,field,globalSegment.base,globalBase,domain);
  }
  for(const object of layout.objects){
    const segment=layout.segments.find(s=>s.name==='properties:'+object.name)!;
    for(const property of object.properties){
      const original=referenceProperties.get(object.id)!.get(property.number);if(!original||original.length!==property.length)throw new Error('Property schema differs '+object.name+'.'+property.name);
      for(const field of segment.fields.filter(f=>segment.base+f.offset>=property.address&&segment.base+f.offset<property.address+property.length)){
        add('property.'+object.name+'.'+property.name+'+'+(segment.base+field.offset-property.address),field,segment.base,original.address-(property.address-segment.base));
      }
    }
  }
  for(const table of layout.tables){
    if((parserBufferGlobals as readonly string[]).includes(table.owner))continue;
    const segment=layout.segments.find(s=>s.name===table.name)!,base=bases.get(table.name)!;
    for(const field of segment.fields)add('table.'+table.owner+'+'+field.offset,field,segment.base,base.reference,table.owner==='C-TABLE'&&field.offset<180&&field.offset%6===4?'routine':field.domain);
  }
  const names=new Map(game.bundle.payload.symbols.symbols.filter(s=>s.kind==='routine').map(s=>[s.number!,s.name]));
  const refNames=new Map(symbols.routines.map(r=>[r.packed,r.name]));
  const strings=new Map(game.bundle.payload.strings.entries.map(s=>[s.id,s.text])),textCache=new Map<string,string>();
  const decoder=new ZVM();decoder.prepare(story,{Glk:{glk_exit(){}}});decoder.version=3;decoder.eof=story.length;decoder.m=MemoryView(story);decoder.init_text();
  const refText=(address:number,length?:number)=>String(decoder.decode(address,length)).replaceAll('\r','\n');
  const value=(field:Field,n:number,side:'own'|'reference'):unknown=>{
    if(field.domain==='string'){
      if(!n)return 0;
      if(side==='own'){const text=strings.get(n);if(text===undefined)throw new Error('Unknown string at '+field.key+': '+n);return text;}
      const key='string:'+n;if(!textCache.has(key))textCache.set(key,refText(n*2));return textCache.get(key)!;
    }
    if(field.domain==='routine'){
      if(!n)return 0;const name=(side==='own'?names:refNames).get(n);if(!name)throw new Error('Unknown routine at '+field.key+': '+n);return name;
    }
    if(field.domain==='address'||field.domain==='dictionary'){
      if(!n)return 0;const target=field.domain==='dictionary'?'dictionary':field.target;
      if(!target)throw new Error('Pointer without schema at '+field.key);
      const base=bases.get(target);if(!base)throw new Error('Unknown pointer target '+target);
      const offset=n-base[side];if(offset<0||offset>base.length)throw new Error('Pointer outside '+target+' at '+field.key+': '+offset);
      return {allocation:target,offset};
    }
    if(!['integer','room','object','property','adjective','attribute','variable','word','padding'].includes(field.domain))throw new Error('Unclassified field '+field.key+' '+field.domain);
    return n;
  };
  const project=(bytes:Buffer,side:'own'|'reference',detachedSiblings:readonly string[]):SemanticProjection=>{
    if(side==='reference')decoder.m=MemoryView(bytes);
    const read=(base:number,width:number)=>width===1?bytes[base]!:bytes.readUInt16BE(base);
    const result:SemanticProjection={};
    for(const object of layout.objects){
      const base=side==='own'?object.address:objectBase+9*(object.id-1),parent=bytes[base+4]!,sibling=bytes[base+5]!;
      const table=side==='own'?object.propertyTable:bytes.readUInt16BE(base+7),size=bytes[table]!*2;
      const raw=bytes.subarray(table+1,table+1+size),key=side+':short:'+raw.toString('hex');
      if(!textCache.has(key))textCache.set(key,side==='own'?decodeZText(a=>bytes[a]!,table+1,size/2):size?refText(table+1,size):'');
      result['object.'+object.name+'.name']=textCache.get(key)!;
      result['object.'+object.name+'.links']=[parent,side==='reference'&&detachedSiblings.includes(object.name)?0:sibling,bytes[base+6]!];
      result['object.'+object.name+'.flags']=[...bytes.subarray(base,base+4)];
    }
    for(const field of fields){
      const base=field[side];
      result[field.key]=field.width===1||field.width===2?value(field,read(base,field.width),side):[...bytes.subarray(base,base+field.width)];
    }
    return result;
  };
  function reference(ram:Buffer,detachedSiblings:readonly string[]=[]):SemanticProjection {
    const actual=layout.objects.filter(o=>ram[objectBase+9*(o.id-1)+4]===0&&ram[objectBase+9*(o.id-1)+5]!==0).map(o=>o.name).sort();
    if(canonicalJson(actual)!==canonicalJson([...detachedSiblings].sort()))throw new Error('Unreviewed REF-001 detached siblings: '+actual.join(','));
    return project(Buffer.concat([ram,story.subarray(ram.length)]),'reference',detachedSiblings);
  }
  return {
    own:(world:WorldState)=>project(Buffer.from(world.snapshot().bytes),'own',[]),reference,
    detachedSiblings:(ram:Buffer)=>layout.objects.filter(o=>ram[objectBase+9*(o.id-1)+4]===0&&ram[objectBase+9*(o.id-1)+5]!==0).map(o=>o.name).sort(),
    counts:{globals:layout.globals.filter(g=>!excluded.has(g.name)).length,objects:layout.objects.length,properties:layout.objects.reduce((n,o)=>n+o.properties.length,0),tables:layout.tables.filter(t=>!(parserBufferGlobals as readonly string[]).includes(t.owner)).length,fields:fields.length},
  };
}
export function compareProjection(own:SemanticProjection,reference:SemanticProjection,label:string):void {
  for(const key of new Set([...Object.keys(own),...Object.keys(reference)]))if(canonicalJson(own[key])!==canonicalJson(reference[key]))throw new Error(label+' '+key+' differs: '+JSON.stringify(own[key])+' vs '+JSON.stringify(reference[key]));
}

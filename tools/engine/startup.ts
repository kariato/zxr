import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { LoadedGame, WorldState } from '../../src/engine/index.ts';
import { decodeZText } from '../../src/engine/index.ts';
import type { MemoryField } from '../../src/zil/index.ts';
import type { ReferenceRun } from '../reference/runner.ts';
import { decodeState, memories } from '../reference/state.ts';
import { loadSymbols, STORY } from '../reference/symbols.ts';

/** Independent release-63 startup comparison. Addresses/string/routine words are normalized by domain. */
export function auditStartup(game:LoadedGame,world:WorldState,run:ReferenceRun){
  if(run.preparedContext||run.commands.length||run.checkpoints.at(-1)?.kind!=='read')throw new Error('Startup audit requires the first reference READ');
  const ram=[...memories(run)].at(-1)!,story=readFileSync(STORY),bytes=Buffer.concat([ram,story.subarray(ram.length)]),reference=loadSymbols(),state=decodeState(ram),memory=game.bundle.payload.memory;
  const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js');
  const decoder=new ZVM();decoder.prepare(bytes,{Glk:{glk_exit(){}}});decoder.version=3;decoder.eof=bytes.length;decoder.m=MemoryView(bytes);decoder.init_text();
  const text=(address:number,length?:number)=>String(decoder.decode(address,length)).replaceAll('\r','\n');
  const equal=(a:unknown,b:unknown,label:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Startup '+label+' differs: '+JSON.stringify(a)+' vs '+JSON.stringify(b));};
  const ownRead=(base:number,width:number)=>{if(width!==1&&width!==2)throw new Error('Unsupported startup scalar width');return width===1?world.getByte(base):world.getWord(base);};
  const refRead=(base:number,width:number)=>width===1?bytes[base]!:bytes.readUInt16BE(base);
  const ownRoutines=new Map(game.bundle.payload.logic.routines.map(r=>[r.id,r.name])),refRoutines=new Map(reference.routines.map(r=>[r.packed,r.name]));
  const routineName=(id:number,names:Map<number,string>):string|0=>{if(!id)return 0;const name=names.get(id);if(!name)throw new Error('Unknown startup routine '+id);return name;};
  const refObjectBase=bytes.readUInt16BE(10)+62;
  const bases=new Map<string,number>([['globals',bytes.readUInt16BE(12)],['objects',bytes.readUInt16BE(10)],['dictionary',bytes.readUInt16BE(8)],['actions',state.globals['ACTIONS']!],['preactions',state.globals['PREACTIONS']!],['verbs',state.globals['VERBS']!],['prepositions',state.globals['PREPOSITIONS']!]]);
  for(const object of memory.objects)bases.set('properties:'+object.name,bytes.readUInt16BE(refObjectBase+9*(object.id-1)+7));
  for(const table of memory.tables){const address=state.globals[table.owner];if(table.name!=='table:'+table.owner||!Number.isInteger(address))throw new Error('Unclassified startup table '+table.name);bases.set(table.name,address!);}
  let globals=0,objects=0,properties=0,tableCells=0,clockSlots=0;
  const value=(field:MemoryField,own:number,expected:number,label:string)=>{
    if(field.domain==='string')equal(own?game.bundle.payload.strings.entries.find(s=>s.id===own)?.text:0,expected?text(expected*2):0,label+' string');
    else if(field.domain==='routine')equal(routineName(own,ownRoutines),routineName(expected,refRoutines),label+' routine');
    else if(field.domain==='address'&&field.target!==undefined){
      const target=memory.segments.find(s=>s.name===field.target),ref=bases.get(field.target);if(!target||ref===undefined)throw new Error('Unknown startup pointer '+field.target);
      equal(own,target.base+(field.addend ?? 0),label+' pointer');equal(expected,ref+(field.addend ?? 0),label+' reference pointer');
    }else equal(own,expected,label);
  };
  const globalSegment=memory.segments.find(s=>s.name==='globals')!;
  for(const global of memory.globals){const field=globalSegment.fields.find(f=>f.offset===global.address-globalSegment.base)!;value(field,world.global(global.name),state.globals[global.name]!,global.name);globals++;}
  for(const object of memory.objects){
    const expected=state.objects.find(o=>o.id===object.id)!,base=bytes.readUInt16BE(refObjectBase+9*(object.id-1)+7);
    equal([world.parent(object.id),world.nextSibling(object.id),world.firstChild(object.id)],[expected.parent,expected.sibling,expected.child],object.name+' links');
    const attributes=world.getWord(object.address)*65536+world.getWord(object.address+2);equal(attributes,parseInt(expected.attributes,16),object.name+' flags');
    equal(decodeZText(a=>world.getByte(a),object.propertyTable+1,world.getByte(object.propertyTable)),bytes[base]?text(base+1,bytes[base]!*2):'',object.name+' name');
    equal(object.properties.map(p=>[p.number,p.length]),expected.properties.map(p=>[p.id,p.bytes.length/2]),object.name+' property layout');
    const segment=memory.segments.find(s=>s.name==='properties:'+object.name)!;
    for(const property of object.properties){
      const ref=expected.properties.find(p=>p.id===property.number)!;
      for(const field of segment.fields.filter(f=>segment.base+f.offset>=property.address&&segment.base+f.offset<property.address+property.length)){
        const ownAddress=segment.base+field.offset,refAddress=ref.address+ownAddress-property.address,label=object.name+'.'+property.name;
        if(field.width===1||field.width===2)value(field,ownRead(ownAddress,field.width),refRead(refAddress,field.width),label);
        else equal(Array.from({length:field.width},(_,i)=>world.getByte(ownAddress+i)),[...bytes.subarray(refAddress,refAddress+field.width)],label+' bytes');
      }properties++;
    }objects++;
  }
  for(const table of memory.tables){
    const segment=memory.segments.find(s=>s.name===table.name)!,base=bases.get(table.name)!;
    for(const field of segment.fields){
      const own=ownRead(table.base+field.offset,field.width),expected=refRead(base+field.offset,field.width),label=table.owner+'+'+field.offset;
      if(table.owner==='C-TABLE'&&field.offset<180&&field.offset%6===4){equal(routineName(own,ownRoutines),routineName(expected,refRoutines),label+' queued routine');clockSlots++;}
      else value(field,own,expected,label);
      tableCells++;
    }
  }
  world.validate();
  return {globals,objects,properties,tables:memory.tables.length,tableCells,clockSlots};
}

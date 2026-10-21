import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, compileWorldMetadata, expandMacros, loadProgram } from '../../src/zil/index.ts';
import type { WorldMetadata, WorldProperty } from '../../src/zil/index.ts';
import { loadSymbols, STORY, STORY_SHA256, sha256 } from '../reference/symbols.ts';
import { sourceFiles } from './program.ts';
import { referenceSymbolLayout } from './symbols.ts';
import { normalizeReferenceProgram } from './reference-program.ts';

export function buildWorldMetadata() {
  const sources=sourceFiles(),program=loadProgram(sources),expanded=expandMacros(program.forms,program.definitions,program.globals);
  const normalized=normalizeReferenceProgram(expanded.forms),analysis=analyzeSymbols(program,normalized.forms,referenceSymbolLayout());
  return compileWorldMetadata(normalized.forms,analysis);
}
/** Independent oracle: assembly declarations/cells plus raw pre-GO story data and upstream text decoder. */
export function auditWorldMetadata(world:WorldMetadata) {
  const symbols=loadSymbols(),story=readFileSync(STORY),data=readFileSync('reference/zork2/zork2dat.zap','utf8'),strings=readFileSync('reference/zork2/zork2str.zap','utf8');
  if(sha256(story)!==STORY_SHA256)throw new Error('World audit: story hash differs');
  const require=createRequire(import.meta.url),{ZVM}=require('ifvms'),{MemoryView}=require('ifvms/src/common/utils.js');
  if(require('ifvms/package.json').version!=='1.1.6')throw new Error('World audit requires ifvms 1.1.6');
  const vm=new ZVM();vm.prepare(story,{Glk:{glk_exit(){}}});vm.version=3;vm.eof=story.length;vm.m=MemoryView(story);vm.init_text();
  const decode=(address:number,length?:number):string=>String(vm.decode(address,length)).replaceAll('\r','\n');
  const quoted=(s:string)=>s.replaceAll('""','"');
  const textByName=new Map([...strings.matchAll(/\.GSTR\s+([^,]+),"((?:[^"]|"")*)"/g)].map(m=>[m[1]!,quoted(m[2]!)]));
  const declarations=[...data.matchAll(/^\s*\.OBJECT\s+([^\n]+)/gm)].map(m=>m[1]!.split(',').map(x=>x.trim()));
  const tables=new Map([...data.matchAll(/^T\?([^:]+)::\s*\.TABLE[^\n]*\n([\s\S]*?)\t.ENDT/gm)].map(m=>[m[1]!,m[2]!]));
  const dictionary=new Map(referenceSymbolLayout().words.map(w=>[w.name,w.referenceAddress!]));
  const wordIndices=new Map(referenceSymbolLayout().words.map((w,i)=>[w.name,i+1]));
  const objectIds=new Map(symbols.objects.map((name,id)=>[name,id]));
  const routinePacked=new Map(symbols.routines.map(r=>[r.name,r.packed]));
  const equal=(actual:unknown,expected:unknown,label:string)=>{
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`World audit: ${label} differs\nactual ${JSON.stringify(actual)}\nexpected ${JSON.stringify(expected)}`);
  };
  const value=(token:string):number=>token.split('+').reduce((sum,part)=>{
    const t=part.trim(),v=/^-?\d+$/.test(t)?Number(t):symbols.constants[t] ?? objectIds.get(t) ?? routinePacked.get(t) ?? (t.startsWith('W?')?dictionary.get(t.slice(2)):undefined);
    if(v===undefined)throw new Error(`World audit: unknown assembly value ${t}`);return sum+v;
  },0)&0xffff;
  const cells=(s:string,length:number)=>{
    const result:{width:number;token:string}[]=[];let bytes=0;
    for(const line of s.split('\n')){
      const t=line.split(';')[0]!.trim();if(!t)continue;
      const match=t.match(/^\.(BYTE|WORD)\s+(.+)$/),width=match?.[1]==='BYTE'?1:2,token=match?.[2] ?? t;
      if(t.startsWith('.')&&!match)throw new Error(`World audit: unexpected property directive ${t}`);
      if(bytes+width>length)throw new Error('World audit: property length crosses a cell');
      result.push({width,token});bytes+=width;if(bytes===length)break;
    }
    if(bytes!==length)throw new Error('World audit: truncated assembly property');return result;
  };
  const assemblyProperties=(table:string)=>{
    const headers=[...table.matchAll(/\.PROP\s+(\d+),P\?([^\s;]+)/g)];
    return headers.map((m,i)=>({name:m[2]!,number:symbols.constants['P?'+m[2]]!,byteLength:Number(m[1]),cells:cells(table.slice(m.index!+m[0].length,headers[i+1]?.index),Number(m[1]))}));
  };
  const expectedValues=(p:WorldProperty,reference:boolean):(string|number)[]=>{
    switch(p.kind){
      case 'number':return [p.value];
      case 'text':return [p.text];
      case 'routine':return [p.routine?(reference?routinePacked.get(p.routine.name)!:p.routine.name):0];
      case 'words':return p.words.map(w=>reference?dictionary.get(w.name)!:'W?'+w.name);
      case 'adjectives':return p.adjectives.map(a=>a.number);
      case 'objects':return p.objects.map(o=>o.id);
      case 'pseudos':return p.entries.flatMap<string|number>(e=>reference?[dictionary.get(e.word.name)!,routinePacked.get(e.routine.name)!]:['W?'+e.word.name,e.routine.name]);
    }
  };
  const low=symbols.constants['LOW-DIRECTION']!,objectBase=story.readUInt16BE(10)+62;
  let properties=0,shortNames=0,textProperties=0,exitDeclarations=0;
  equal(world.format,'zxr-world-v1','format');equal(world.stage,'metadata','stage');equal(world.semantics,'zxr-zork2-semantics-v1','semantics');
  equal(world.counts,{rooms:world.entities.filter(e=>e.kind==='room').length,objects:world.entities.filter(e=>e.kind==='object').length,properties:world.entities.reduce((n,e)=>n+e.properties.length,0),pendingExits:world.entities.reduce((n,e)=>n+e.pendingExits.length,0)},'counts');
  equal(new Set(world.entities.map(e=>e.id)).size,world.entities.length,'unique entity IDs');
  equal(world.propertyDefaults.map(p=>p.number),Array.from({length:31},(_,i)=>i+1),'default numbering');
  equal(world.entities.length,declarations.length,'entity count');
  for(const e of world.entities){
    const d=declarations[e.id-1];if(!d)throw new Error('World audit: invalid object id '+e.id);
    equal(e.name,d[0],`object id ${e.id}`);
    if(e.parent)equal(e.parent.id,objectIds.get(e.parent.name),`${e.name} parent name/id`);
    for(const f of e.flags)equal(f.number,symbols.constants[f.name],`${e.name} flag name/number`);
    const address=objectBase+(e.id-1)*9,table=story.readUInt16BE(address+7);
    equal(e.parent?.id ?? 0,value(d[3]!),`${e.name} assembly parent`);equal(e.parent?.id ?? 0,story[address+4],`${e.name} binary parent`);
    const flags=e.flags.reduce((n,f)=>n+2**(31-f.number),0);
    equal(flags,((value(d[1]!)<<16)|value(d[2]!))>>>0,`${e.name} assembly flags`);equal(flags,story.readUInt32BE(address),`${e.name} binary flags`);
    const body=tables.get(e.name);if(body===undefined)throw new Error(`World audit: no property table ${e.name}`);
    const short=body.match(/\.STRL\s+"((?:[^"]|"")*)"/);if(!short)throw new Error('World audit: missing short name '+e.name);
    equal(e.shortName.text,quoted(short[1]!),`${e.name} assembly DESC`);
    equal(e.shortName.text,story[table]?decode(table+1,story[table]!*2):'',`${e.name} binary DESC`);shortNames++;
    const aps=assemblyProperties(body),raw=new Map<number,Buffer>();let cursor=table+1+story[table]!*2;
    while(story[cursor]){const header=story[cursor++]!,length=(header>>>5)+1;raw.set(header&31,story.subarray(cursor,cursor+length));cursor+=length;}
    equal(e.properties.map(p=>p.property.number),aps.filter(p=>p.number<low).map(p=>p.number),`${e.name} assembly property presence/order`);
    equal(e.properties.map(p=>p.property.number),[...raw.keys()].filter(n=>n<low),`${e.name} binary property presence/order`);
    equal(e.pendingExits.map(p=>p.property.number),aps.filter(p=>p.number>=low).map(p=>p.number),`${e.name} pending exit presence/order`);
    for(const p of e.properties){
      const a=aps.find(a=>a.number===p.property.number)!,r=raw.get(p.property.number)!;
      equal(p.property.name,a.name,`${e.name} property name/number`);
      const checkWord=(w:{name:string;dictionaryIndex:number})=>equal(w.dictionaryIndex,wordIndices.get(w.name),`${e.name} dictionary index ${w.name}`);
      const checkRoutine=(r:{name:string;id:number})=>equal(r.id,symbols.routines.findIndex(s=>s.name===r.name)+1,`${e.name} routine id ${r.name}`);
      if(p.kind==='words')for(const w of p.words)checkWord(w);
      if(p.kind==='routine'&&p.routine)checkRoutine(p.routine);
      if(p.kind==='pseudos')for(const entry of p.entries){checkWord(entry.word);checkRoutine(entry.routine);}
      if(p.kind==='adjectives')for(const adj of p.adjectives)equal(adj.number,symbols.constants['A?'+adj.name],`${e.name} adjective code ${adj.name}`);
      if(p.kind==='objects')for(const obj of p.objects)equal(obj.id,objectIds.get(obj.name),`${e.name} local GLOBAL id ${obj.name}`);
      equal(p.byteLength,a.byteLength,`${e.name}.${p.property.name} assembly length`);equal(p.byteLength,r.length,`${e.name}.${p.property.name} binary length`);
      const widths=p.kind==='objects'||p.kind==='adjectives'?1:2;
      equal(a.cells.map(c=>c.width),Array.from({length:p.byteLength/widths},()=>widths),`${e.name}.${p.property.name} field widths`);
      const av=a.cells.map(c=>p.kind==='text'?textByName.get(c.token):p.kind==='routine'||p.kind==='words'||p.kind==='pseudos'?c.token==='0'?0:c.token:value(c.token));
      equal(expectedValues(p,false),av,`${e.name}.${p.property.name} assembly values`);
      const bv=p.kind==='text'?[decode(r.readUInt16BE(0)*2)]:Array.from({length:r.length/widths},(_,i)=>widths===1?r[i]!:r.readUInt16BE(i*2));
      equal(expectedValues(p,true),bv,`${e.name}.${p.property.name} binary values`);properties++;if(p.kind==='text')textProperties++;
    }
    exitDeclarations+=e.pendingExits.length;
  }
  const defaultText=data.match(/^OBJECT::\.TABLE[^\n]*\n([\s\S]*?)(?=\s*\.OBJECT)/m)?.[1];
  if(defaultText===undefined)throw new Error('World audit: missing property defaults');
  const assemblyDefaults=defaultText.split('\n').map(l=>l.split(';')[0]!.trim()).filter(Boolean).map(value);
  equal(world.propertyDefaults.map(p=>p.value),assemblyDefaults,'assembly property defaults');
  for(const p of world.propertyDefaults)equal(p.value,story.readUInt16BE(story.readUInt16BE(10)+(p.number-1)*2),`binary default ${p.number}`);
  const sources=sourceFiles();
  const spots=auditWorldSpotChecks(world);
  return {format:'zxr-world-audit-v1',stage:'metadata',storySha256:STORY_SHA256,worldSha256:sha256(JSON.stringify(world)),
    sourceHashes:[...sources].map(([file,text])=>({file,sha256:sha256(text)})),
    checked:{entities:world.entities.length,rooms:world.counts.rooms,objects:world.counts.objects,shortNames,metadataProperties:properties,textProperties,propertyDefaults:world.propertyDefaults.length,pendingExitDeclarations:exitDeclarations},
    sourceSpotChecks:spots,
    limits:['Exit encodings are pending step 2.3; only declaration presence is checked here.','The image is initial story data before GO; startup mutations are not pre-applied.','This is world metadata, not a runtime memory image, sibling ordering or a complete game bundle.']};
}

export function propertyValue(p:WorldProperty):unknown {
  switch(p.kind){
    case 'number':return p.value;case 'text':return p.text;case 'routine':return p.routine?.name ?? null;
    case 'words':return p.words.map(w=>w.name);case 'adjectives':return p.adjectives.map(a=>a.name);case 'objects':return p.objects.map(o=>o.name);
    case 'pseudos':return p.entries.map(e=>[e.word.name,e.routine.name]);
  }
}
export function auditWorldSpotChecks(world:WorldMetadata) {
  const fixture=JSON.parse(readFileSync('reference/world-spot-checks.json','utf8')) as {format:string;cases:{name:string;kind:string;parent:string|null;shortName:string;flags:string[];properties?:Record<string,unknown>;contains?:Record<string,string>;absent?:string[]}[]};
  if(fixture.format!=='zxr-world-spot-checks-v1'||fixture.cases.length!==20||new Set(fixture.cases.map(c=>c.name)).size!==20||fixture.cases.filter(c=>c.kind==='room').length!==10)throw new Error('World source spots require ten distinct rooms and ten distinct objects');
  return fixture.cases.map(c=>{
    const e=world.entities.find(e=>e.name===c.name);if(!e)throw new Error('World source spot missing '+c.name);
    const equal=(actual:unknown,expected:unknown,label:string)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`World source spot ${c.name}.${label} differs`);};
    equal(e.kind,c.kind,'kind');equal(e.parent?.name ?? null,c.parent,'parent');equal(e.shortName.text,c.shortName,'DESC');equal(e.flags.map(f=>f.name).sort(),[...c.flags].sort(),'FLAGS');
    for(const [name,expected] of Object.entries(c.properties ?? {})){const p=e.properties.find(p=>p.property.name===name);equal(p?propertyValue(p):undefined,expected,name);}
    for(const [name,substring] of Object.entries(c.contains ?? {})){const p=e.properties.find(p=>p.property.name===name);if(!p||p.kind!=='text'||!p.text.includes(substring))throw new Error(`World source spot ${c.name}.${name} missing text`);}
    for(const name of c.absent ?? [])if(e.properties.some(p=>p.property.name===name))throw new Error(`World source spot ${c.name}.${name} should be absent`);
    return {name:e.name,kind:e.kind,file:e.source.file,line:e.source.start.line};
  });
}

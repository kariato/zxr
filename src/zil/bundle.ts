import { projectParserAdapter } from './parser-adapter.ts';
import type { ParserAdapter } from './parser-adapter.ts';
import { canonicalJson, hashJson, utf8Decode, utf8Encode } from './integrity.ts';
import { assertSchema } from './schema.ts';
import { definitions } from './schemas.ts';
import { validateMemoryImage } from './memory.ts';
import type { MemoryImage } from './memory.ts';
import { validateStringPool } from './strings.ts';
import type { StringPool } from './strings.ts';
import type { SymbolDefinition } from './symbols.ts';
import type { WorldMetadata, WorldProperty } from './world.ts';
import { encodeZText } from './encoding.ts';
import { linkExit, decodeExit } from './exits.ts';
import { logicExpressions, OBJECT_OPERATIONS, OUTPUT_OPERATIONS } from './logic.ts';
import type { LogicExpression, LogicRoutine, LogicBinding, LogicCommand } from './logic.ts';
import type { Vocabulary } from './vocabulary.ts';
import { SYNTAX_FLAGS } from './vocabulary.ts';
import type { MappedRoutine, LogicSourceMap, TranslationReport, SourceMapResult } from './source-maps.ts';
import { mappedSites, sourceLocationSpan } from './source-maps.ts';
import type { ParserSplit } from './parser.ts';
export const BUNDLE_VERSIONS={compiler:'zxr-compiler-v1',vm:'zxr-vm-v1',adapter:'zxr-adapter-v15',optionEncoder:'zxr-option-encoder-v1',gateRules:'zxr-gates-v1'} as const;
export interface RuntimeSymbols {format:'zxr-symbols-v1';symbols:Omit<SymbolDefinition,'referenceAddress'>[]}
export interface RuntimeLogic {format:'zxr-runtime-logic-v1';semantics:'zxr-zork2-semantics-v1';routines:MappedRoutine[];adapter:ParserAdapter|null;excluded:{name:string;id:number;policy:'adapter'|'replaced-middle'}[]}
export interface BundlePayload {game:{id:string;title:string};versions:typeof BUNDLE_VERSIONS;initialization:{kind:'call-entry';routine:{name:string;id:number};checkpoint:'pre-GO';rng:{algorithm:'xorshift32-v1';seed:number}};gateRules:never[];world:WorldMetadata;vocabulary:Vocabulary;memory:MemoryImage;strings:StringPool;symbols:RuntimeSymbols;logic:RuntimeLogic}
export interface GameBundle {format:'zxr-bundle-v1';schemaVersion:1;semantics:'zxr-zork2-semantics-v1';buildHash:string;presentationHash:string;contentHash:string;payload:BundlePayload;debug:{sources:LogicSourceMap;report:TranslationReport;parser:ParserSplit|null};licenses:{spdx:string;text:string}[]}
export function runtimeLogic(mapped:SourceMapResult):RuntimeLogic {
  const p=mapped.program.parser;return {format:'zxr-runtime-logic-v1',semantics:mapped.program.semantics,routines:mapped.program.routines,adapter:p?projectParserAdapter(mapped.referenceRoutines.find(r=>r.id===p.adapterRoutineId)!,mapped.referenceRoutines.find(r=>r.name==='SYNTAX-CHECK')!,mapped.referenceRoutines.find(r=>r.name==='GET-OBJECT')!):null,excluded:(p?.routines ?? []).filter(r=>r.policy!=='kept').map(r=>({name:r.name,id:r.id,policy:r.policy as 'adapter'|'replaced-middle'}))};
}
/** Debug positions/IDs and source spelling do not change compatibility identity. */
export function semanticBundleData(value:unknown):unknown {
  if(Array.isArray(value))return value.map(semanticBundleData);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['source','origin','sourceMapId','nodeId','parentSource','flagsSource','declaration','title'].includes(k)).map(([k,v])=>[k,semanticBundleData(v)]));return value;
}
export function createBundle(payload:BundlePayload,debug:GameBundle['debug'],licenses:GameBundle['licenses']):GameBundle {
  const bundle:GameBundle={format:'zxr-bundle-v1',schemaVersion:1,semantics:'zxr-zork2-semantics-v1',buildHash:hashJson(semanticBundleData(payload)),presentationHash:hashJson({title:payload.game.title}),contentHash:'0'.repeat(64),payload,debug,licenses};
  bundle.contentHash=contentHash(bundle);validateBundle(bundle);return bundle;
}
const contentHash=(bundle:GameBundle)=>{const {contentHash:ignored,...rest}=bundle;return hashJson(rest);};
export function packBundle(bundle:GameBundle):Uint8Array {validateBundle(bundle);return utf8Encode(canonicalJson(bundle)+'\n');}
export function unpackBundle(input:string|Uint8Array):GameBundle {
  if(typeof input!=='string'&&!(input instanceof Uint8Array))throw new Error('Expected bundle text or UTF-8 bytes');
  const limit=64*1024*1024;if(input.length>limit)throw new Error('Bundle exceeds the 64 MiB input limit');
  if(typeof input==='string'){let size=0;for(const c of input){const n=c.codePointAt(0)!;size+=n<128?1:n<2048?2:n<65536?3:4;if(size>limit)throw new Error('Bundle exceeds the 64 MiB input limit');}}
  const text=typeof input==='string'?input:utf8Decode(input);
  let data:unknown;try{data=JSON.parse(text);}catch{throw new Error('Bundle is not valid JSON');}validateBundle(data);return data;
}
export function validateBundle(value:unknown):asserts value is GameBundle {
  assertSchema(value,{$ref:'#/$defs/bundle'},definitions,'bundle');const b=value as GameBundle;
  if(canonicalJson(b.payload.versions)!==canonicalJson(BUNDLE_VERSIONS))throw new Error('Bundle uses unsupported compiler/VM/adapter versions');
  if(hashJson(semanticBundleData(b.payload))!==b.buildHash)throw new Error('Bundle semantic build hash mismatch');
  if(hashJson({title:b.payload.game.title})!==b.presentationHash)throw new Error('Bundle presentation hash mismatch');
  if(contentHash(b)!==b.contentHash)throw new Error('Bundle content hash mismatch');validateBundleReferences(b);
}
export function validateBundleReferences(bundle:GameBundle):void {
  const p=bundle.payload,m=p.memory,v=p.vocabulary,world=p.world,logic=p.logic,fail=(s:string):never=>{throw new Error('Bundle references: '+s);};
  const same=(a:unknown,b:unknown,s:string)=>{if(canonicalJson(a)!==canonicalJson(b))fail(s);};
  const unique=<T,K extends string|number>(rows:readonly T[],key:(v:T)=>K,label:string)=>{const map=new Map(rows.map(r=>[key(r),r]));if(map.size!==rows.length)fail('duplicate '+label);return map;};
  validateMemoryImage(m);validateStringPool(p.strings);
  const symbols=unique(p.symbols.symbols,s=>s.name,'symbol'),routines=unique(logic.routines,r=>r.id,'runtime routine ID'),routineNames=unique(logic.routines,r=>r.name,'runtime routine name'),excluded=unique(logic.excluded,r=>r.id,'excluded routine ID');
  unique(logic.excluded,r=>r.name,'excluded routine name');
  const allRoutineSymbols=p.symbols.symbols.filter(s=>s.kind==='routine').sort((a,b)=>a.number!-b.number!);
  if(allRoutineSymbols.some((s,i)=>s.number!==i+1))fail('routine IDs must be dense across runtime and excluded entries');
  const knownRoutine=(name:string,id:number,allowExcluded=false)=>{const s=symbols.get(name);if(s?.kind!=='routine'||s.number!==id||!allowExcluded&&!routines.has(id))fail('unknown or excluded routine '+name);};
  for(const r of logic.routines){knownRoutine(r.name,r.id);if(excluded.has(r.id))fail('runtime/excluded overlap');}
  for(const e of logic.excluded){knownRoutine(e.name,e.id,true);if(routineNames.has(e.name))fail('runtime/excluded name overlap');}
  if(allRoutineSymbols.length!==logic.routines.length+logic.excluded.length)fail('incomplete routine partition');
  const adapters=logic.excluded.filter(r=>r.policy==='adapter');if(logic.adapter){same(adapters,[{name:logic.adapter.name,id:logic.adapter.id,policy:'adapter'}],'adapter partition');knownRoutine(logic.adapter.name,logic.adapter.id,true);}else if(adapters.length)fail('unexpected adapter');
  knownRoutine(p.initialization.routine.name,p.initialization.routine.id);const initial=routines.get(p.initialization.routine.id)!;if(initial.required)fail('entry routine requires arguments');
  const strings=new Map(p.strings.entries.map(e=>[e.text,e.id])),objects=unique(world.entities,e=>e.id,'world object'),objectsByName=unique(world.entities,e=>e.name,'world object name'),words=unique(m.words,w=>w.name,'dictionary name'),segments=unique(m.segments,s=>s.name,'memory segment');
  same(world.entities.map(e=>[e.name,e.id]),m.objects.map(o=>[o.name,o.id]),'world/memory object identities');
  const globals=unique(m.globals,g=>g.name,'global name');unique(m.globals,g=>g.number,'global number');if(m.globals.some((g,i)=>g.number!==i+16))fail('global numbers are not dense');
  for(const s of p.symbols.symbols){if(s.number===null)fail('unallocated runtime symbol '+s.name);
    if(s.kind==='global'){if(globals.get(s.name)?.number!==s.number)fail('global symbol mismatch '+s.name);}
    if(s.kind==='room'||s.kind==='object'){if(objectsByName.get(s.name)?.id!==s.number||objectsByName.get(s.name)?.kind!==s.kind)fail('object symbol mismatch '+s.name);}
    if(s.kind==='word'){const w=words.get(s.name.slice(2));if(w?.address!==s.number||w.dictionaryIndex!==s.dictionaryIndex)fail('dictionary symbol mismatch '+s.name);}
  }
  if(p.symbols.symbols.filter(s=>s.kind==='global').length!==globals.size||p.symbols.symbols.filter(s=>s.kind==='object'||s.kind==='room').length!==objects.size||p.symbols.symbols.filter(s=>s.kind==='word').length!==words.size)fail('incomplete symbol map');
  const rawWord=(a:number)=>m.bytes[a]!*256+m.bytes[a+1]!,bytes=(a:number,n:number)=>m.bytes.slice(a,a+n),fieldWord=(s:string,i:number)=>{const segment=segments.get(s) ?? fail('missing segment '+s);if(i<0||2*i+2>segment.length)fail('table index outside '+s);return rawWord(segment.base+2*i);};
  const header=segments.get('header') ?? fail('missing header');
  same(header.writableRanges,[{offset:16,length:2}],'header write permissions');
  if(header.base!==0||header.length!==64||!header.mutable||rawWord(4)!==m.staticBase||rawWord(6)!==0||rawWord(24)!==0||rawWord(26)!==m.bytes.length/2||rawWord(28)!==0)fail('invalid data-only header');
  if(segments.get('objects')?.length!==62+9*objects.size||segments.get('globals')?.length!==480||!segments.get('objects')?.mutable||!segments.get('globals')?.mutable)fail('invalid object/global allocation');
  same(m.bytes.slice(segments.get('dictionary')!.base,segments.get('dictionary')!.base+5),[3,46,44,34,7],'dictionary header');
  unique(m.tables,t=>t.name,'source table');
  for(const table of m.tables){const s=segments.get(table.name);if(s?.kind!=='table'||s.base!==table.base||s.length!==table.length)fail('table allocation mismatch');}
  if(m.tables.length!==m.segments.filter(s=>s.kind==='table').length)fail('unclassified table allocation');
  const domains=new Set(['address','adjective','ascii','dictionary-header','dictionary-roles','dictionary-text','integer','object','padding','preposition','property','property-header','reserved','room','routine','string','syntax-row','variable','zstring']);
  for(const segment of m.segments)for(const f of segment.fields){if(!domains.has(f.domain))fail('unknown field domain '+f.domain);if(f.domain==='routine'&&f.target!==undefined)knownRoutine(f.target,f.width===1?m.bytes[segment.base+f.offset]!:rawWord(segment.base+f.offset));if(['address','adjective','integer','object','preposition','property','room','routine','string','variable'].includes(f.domain)&&![1,2].includes(f.width))fail('invalid scalar field width');
    const value=f.width===1?m.bytes[segment.base+f.offset]!:rawWord(segment.base+f.offset);
    if(['address','routine','string'].includes(f.domain)&&value!==0&&f.target===undefined)fail('reference field has no relocation');
    if((f.domain==='object'||f.domain==='room')&&value!==0&&!objects.has(value))fail('invalid object field');
    if(f.domain==='variable'&&!m.globals.some(g=>g.number===value))fail('invalid variable-number field');
    if(f.domain==='string'&&f.target!==undefined&&strings.get(f.target)!==value)fail('invalid string relocation');}
  for(const g of m.globals)if(g.number<16||g.number>255)fail('global out of range');
  same(world.counts,{rooms:world.entities.filter(e=>e.kind==='room').length,objects:world.entities.filter(e=>e.kind==='object').length,properties:world.entities.reduce((n,e)=>n+e.properties.length,0),exits:world.entities.reduce((n,e)=>n+e.exits.length,0)},'world counts');
  const objectRef=(name:string,id:number)=>{if(objects.get(id)?.name!==name)fail('unknown object reference '+name);};
  const dictionaryRef=(name:string,index:number)=>{const w=words.get(name);if(w?.dictionaryIndex!==index)fail('unknown dictionary reference '+name);return w!;};
  const propertyBytes=(prop:WorldProperty):number[]=>{
    const w=(n:number)=>[n>>>8,n&255];switch(prop.kind){
      case 'number':return w(prop.value);case 'text':return w(strings.get(prop.text) ?? fail('unpooled property text'));
      case 'routine':if(prop.routine)knownRoutine(prop.routine.name,prop.routine.id);return w(prop.routine?.id ?? 0);
      case 'words':return prop.words.flatMap(r=>w(dictionaryRef(r.name,r.dictionaryIndex).address));
      case 'adjectives':return prop.adjectives.map(a=>{if(symbols.get('A?'+a.name)?.kind!=='adjective'||symbols.get('A?'+a.name)?.number!==a.number||a.number>255)fail('adjective property mismatch');return a.number;});
      case 'objects':return prop.objects.map(o=>{objectRef(o.name,o.id);return o.id;});
      case 'pseudos':return prop.entries.flatMap(e=>{knownRoutine(e.routine.name,e.routine.id);return [...w(dictionaryRef(e.word.name,e.word.dictionaryIndex).address),...w(e.routine.id)];});
    }
  };
  same(world.propertyDefaults.map(d=>d.number),Array.from({length:31},(_,i)=>i+1),'property default ordering');for(const d of world.propertyDefaults)if(fieldWord('objects',d.number-1)!==d.value)fail('property default mismatch');
  for(const e of world.entities){const record=m.objects[e.id-1]!;if(e.parent)objectRef(e.parent.name,e.parent.id);
    if(m.bytes[record.address+4] !== (e.parent?.id ?? 0))fail('initial parent mismatch');
    const flags=e.flags.reduce((mask,f)=>{if(f.number>31||symbols.get(f.name)?.kind!=='attribute'||symbols.get(f.name)?.number!==f.number)fail('attribute mismatch');return (mask|2**(31-f.number))>>>0;},0);unique(e.flags,f=>f.number,'attribute');
    if(flags!==(rawWord(record.address)*65536+rawWord(record.address+2)))fail('object flag bytes mismatch');
    const text=encodeZText(e.shortName.text);same(bytes(record.propertyTable,1+text.length),[text.length/2,...text],'encoded short name');
    const properties=[...e.properties,...e.exits].sort((a,b)=>b.property.number-a.property.number);unique(properties,p=>p.property.number,'object property');
    same(properties.map(p=>[p.property.name,p.property.number,p.byteLength]),record.properties.map(p=>[p.name,p.number,p.length]),'property metadata/layout');
    for(const [i,prop] of properties.entries()){if(symbols.get('P?'+prop.property.name)?.kind!=='property'||symbols.get('P?'+prop.property.name)?.number!==prop.property.number)fail('property number mismatch');
      const expected='kind' in prop?propertyBytes(prop):linkExit(prop,text=>strings.get(text) ?? fail('unpooled exit text'));
      if(!('kind' in prop)){same(prop.view,decodeExit(prop,{symbols:p.symbols.symbols,references:[],routines:[],diagnostics:[]}),'exit view/bytes mismatch');const view=prop.view;if('to' in view&&objectsByName.get(view.to)?.kind!=='room'&&view.to!=='ROOMS')fail('exit destination is not a room');if(view.kind==='FEXIT'){const r=symbols.get(view.routine);knownRoutine(view.routine,r?.number ?? 0);}if(view.kind==='CEXIT'&&!globals.has(view.global))fail('unknown exit global');if(view.kind==='DEXIT'&&!objectsByName.has(view.door))fail('unknown exit door');}
      same(bytes(record.properties[i]!.address,prop.byteLength),expected,'property bytes '+e.name+'.'+prop.property.name);
    }
  }
  same(v.words.map(w=>[w.name,w.dictionaryIndex]),m.words.map(w=>[w.name,w.dictionaryIndex]),'vocabulary/dictionary identities');
  const masks:Record<string,number>={object:128,verb:64,adjective:32,direction:16,preposition:8,buzz:4},selectors:Record<string,number>={object:0,verb:1,adjective:2,direction:3,preposition:0,buzz:0};
  for(const w of v.words){const d=words.get(w.name)!,roles=Object.keys(w.roles),primary=d.primaryRole,secondary=roles.find(r=>r!==primary);if(!roles.length||roles.length>2||!roles.includes(primary))fail('invalid dictionary roles');
    for(const [key,prefix,kind] of [['adjective','A?','adjective'],['direction','P?','property'],['verb','ACT?','lexical-verb'],['preposition','PR?','preposition']] as const){const role=w.roles[key];if(role){const s=symbols.get(prefix+role.name);if(s?.kind!==kind||s.number!==role.number)fail('invalid dictionary role reference');}}
    const value=(key:string)=>{const role=w.roles[key as keyof typeof w.roles];return role===true?1:typeof role==='number'?role:role?.number ?? 0;};
    same(bytes(d.address,7),[...encodeZText(({PERIOD:'.',COMMA:',',QUOTE:'"'} as Record<string,string>)[w.name] ?? w.name.toLowerCase(),true),roles.reduce((a,r)=>a|masks[r]!,0)|selectors[primary]!,value(primary),secondary?value(secondary):0],'dictionary packed roles');
  }
  const actions=unique(v.actions,a=>a.number,'action');unique(v.verbs,v=>v.name,'lexical verb');unique(v.verbs,v=>v.number,'lexical verb number');
  if(v.actions.some((a,i)=>a.number!==i))fail('action IDs are not dense');
  for(const a of v.actions){knownRoutine(a.routine.name,a.routine.id);if(a.preaction)knownRoutine(a.preaction.name,a.preaction.id);if(fieldWord('actions',a.number)!==a.routine.id||fieldWord('preactions',a.number)!==(a.preaction?.id ?? 0))fail('dispatch table mismatch');}
  for(const verb of v.verbs){const segment=segments.get('syntax:'+verb.name) ?? fail('missing syntax table');if(fieldWord('verbs',255-verb.number)!==segment.base||m.bytes[segment.base]!==verb.rows.length||segment.length!==1+8*verb.rows.length)fail('lexical table layout');dictionaryRef(verb.word.name,verb.word.dictionaryIndex);
    for(const [i,row] of verb.rows.entries()){if(row.id!==i+1||!actions.has(row.action.number)||actions.get(row.action.number)!.name!==row.action.name)fail('invalid syntax action/row');
      for(const slot of row.slots){const flags=slot.rules.reduce((n,rule)=>n|SYNTAX_FLAGS[rule],0);if(flags!==slot.flags||new Set(slot.rules).size!==slot.rules.length)fail('invalid syntax flags');if(slot.preposition&&!v.prepositions.some(p=>p.name===slot.preposition!.name&&p.number===slot.preposition!.number))fail('unknown syntax preposition');if(slot.find&&(symbols.get(slot.find.name)?.kind!=='attribute'||symbols.get(slot.find.name)?.number!==slot.find.number))fail('unknown syntax FIND');}
      same(row.bytes,[row.slots.length,row.slots[0]?.preposition?.number ?? 0,row.slots[1]?.preposition?.number ?? 0,row.slots[0]?.find?.number ?? 0,row.slots[1]?.find?.number ?? 0,row.slots[0]?.flags ?? 0,row.slots[1]?.flags ?? 0,row.action.number],'syntax semantic bytes');same(bytes(segment.base+1+8*i,8),row.bytes,'syntax memory bytes');
      same(row.preaction,actions.get(row.action.number)!.preaction,'syntax preaction');
    }
  }
  if(fieldWord('prepositions',0)!==v.prepositions.length)fail('preposition count');for(const [i,prep] of v.prepositions.entries()){const d=dictionaryRef(prep.word.name,prep.word.dictionaryIndex);if(fieldWord('prepositions',i*2+1)!==d.address||fieldWord('prepositions',i*2+2)!==prep.number)fail('preposition memory');}
  same(v.counts,{words:v.words.length,verbs:v.verbs.length,syntax:v.verbs.reduce((n,v)=>n+v.rows.length,0),synonyms:v.synonyms.length,buzz:v.buzz.length,directions:v.directions.length,prepositions:v.prepositions.length,actions:v.actions.length},'vocabulary counts');
  for(const syn of v.synonyms){dictionaryRef(syn.canonical.name,syn.canonical.dictionaryIndex);for(const alias of syn.aliases)dictionaryRef(alias.name,alias.dictionaryIndex);}
  for(const d of v.directions){dictionaryRef(d.word.name,d.word.dictionaryIndex);if(symbols.get('P?'+d.name)?.kind!=='property'||symbols.get('P?'+d.name)?.number!==d.number)fail('direction property mismatch');}
  for(const buzz of v.buzz)dictionaryRef(buzz.word.name,buzz.word.dictionaryIndex);
  validateLogic(logic,symbols,m,p.strings,fail);validateBundleSources(bundle,fail);
}
function validateLogic(logic:RuntimeLogic,symbols:Map<string,RuntimeSymbols['symbols'][number]>,memory:MemoryImage,strings:StringPool,fail:(s:string)=>never){
  const routines=new Map(logic.routines.map(r=>[r.id,r])),handles=new Set(strings.entries.map(s=>s.id)),segments=new Map(memory.segments.map(s=>[s.name,s]));
  for(const r of [...logic.routines,...(logic.adapter?[logic.adapter.entry,logic.adapter.checks,logic.adapter.noVerb,logic.adapter.notHere]:[])]){
    const nodes=[...logicExpressions(r)],bindings=[...r.bindings,...nodes.filter(e=>e.op==='block').flatMap(e=>e.bindings)];
    if(new Set(bindings.map(b=>b.slot)).size!==bindings.length||bindings.length!==r.slotCount||bindings.map(b=>b.slot).sort((a,b)=>a-b).some((slot,i)=>slot!==i+1))fail('invalid local slot allocation in '+r.name);
    if(r.required!==r.bindings.filter(b=>b.kind==='required').length||r.optional!==r.bindings.filter(b=>b.kind==='optional').length||r.bindings.some(b=>b.kind==='block'))fail('invalid parameter counts');
    const blocks=nodes.filter(e=>e.op==='block');if(new Set(blocks.map(b=>b.id)).size!==blocks.length)fail('duplicate block target');
    let phase=0;for(const b of r.bindings){const n=b.kind==='required'?0:b.kind==='optional'?1:2;if(n<phase)fail('parameter ordering');phase=n;if((b.kind==='required')!==(b.initializer===null))fail('initializer/parameter mismatch');}
    const variable=(v:{scope:string;number:number;name:string},scope:Map<string,number>)=>{if(v.scope==='local'){if(scope.get(v.name)!==v.number)fail('out-of-scope local '+r.name+'.'+v.name);}else {const s=symbols.get(v.name);if(s?.kind!=='global'||s.number!==v.number)fail('invalid global variable '+v.name);}};
    const arity=(e:{args:LogicExpression[]},min:number,max=min)=>{if(e.args.length<min||e.args.length>max)fail('invalid operation arity in '+r.name);};
    const bind=(list:LogicBinding[],scope:Map<string,number>,targets:number[])=>{for(const b of list){if(b.initializer)visit(b.initializer,scope,targets);scope.set(b.name,b.slot);}};
    const body=(commands:LogicCommand[],scope:Map<string,number>,targets:number[])=>{for(const c of commands)visit(c.expression,scope,targets);};
    const visit=(e:LogicExpression,scope:Map<string,number>,targets:number[])=>{
      switch(e.op){
        case 'block':{if(e.bindings.some(b=>b.kind!=='block'))fail('invalid block binding');const local=new Map(scope);bind(e.bindings,local,[...targets,e.id]);body(e.body,local,[...targets,e.id]);return;}
        case 'load':case 'variable-number':variable(e.variable,scope);return;
        case 'store':variable(e.variable,scope);visit(e.value,scope,targets);return;
        case 'update-compare':variable(e.variable,scope);visit(e.bound,scope,targets);return;
        case 'symbol':{const s=symbols.get(e.name);if(!s||s.kind!==e.kind||s.number!==e.value)fail('invalid numeric symbol '+e.name);if(e.kind==='routine'&&!routines.has(e.value))fail('reference to excluded routine');return;}
        case 'string':if(!handles.has(e.handle))fail('invalid string handle');return;
        case 'address':{const s=segments.get(e.allocation);if(!s||e.value!==s.base+e.addend||e.addend>s.length)fail('invalid linked address');if(e.name.startsWith('W?')&&memory.words.find(w=>w.name===e.name.slice(2))?.address!==e.value)fail('dictionary address mismatch');return;}
        case 'call':{const target=routines.get(e.routine.id);if(logic.adapter?.id===e.routine.id){if(e.routine.name!==logic.adapter.name||r.name!=='MAIN-LOOP-1'||e.args.length)fail('invalid parser adapter call');}else{if(target?.name!==e.routine.name)fail('invalid direct call');arity(e,target.required,target.required+target.optional);}break;}
        case 'return':if(e.target.kind==='block'&&targets.at(-1)!==e.target.id)fail('return target is not active');visit(e.value,scope,targets);return;
        case 'again':if(e.target.kind==='block'&&targets.at(-1)!==e.target.id||e.target.kind==='routine'&&targets.length)fail('invalid AGAIN target');return;
        case 'primitive':if(e.operator==='+'||e.operator==='*')arity(e,2,65535);else if(e.operator==='-')arity(e,1,2);else if(e.operator==='EQUAL?')arity(e,2,4);else arity(e,['0?','ZERO?','1?','NOT'].includes(e.operator)?1:2);break;
        case 'memory':arity(e,['PUT','PUTB'].includes(e.operator)?3:2);break;
        case 'object':arity(e,OBJECT_OPERATIONS[e.operator as keyof typeof OBJECT_OPERATIONS]);break;
        case 'output':arity(e,OUTPUT_OPERATIONS[e.operator as keyof typeof OUTPUT_OPERATIONS]);if(e.operator==='PRINTI'&&e.args[0]?.op!=='string')fail('PRINTI requires a pooled literal');break;
        case 'suspend':arity(e,e.operator==='READ'?2:0);break;
        case 'unsupported-host':arity(e,1);break;
        case 'cond':for(const c of e.clauses){visit(c.test,scope,targets);body(c.body,scope,targets);}return;
        case 'apply':{const x=e.routine;
          const allowed=x.op==='symbol'&&x.kind==='routine'||x.op==='literal'&&x.value===0||x.op==='object'&&x.operator==='GETP'&&x.args[1]?.op==='symbol'&&['P?ACTION','P?DESCFCN','P?CONTFCN'].includes(x.args[1].name)||x.op==='memory'&&x.operator==='GET'&&(x.args[0]?.op==='load'&&x.args[0].variable.scope==='global'&&['ACTIONS','PREACTIONS'].includes(x.args[0].variable.name)||r.name==='CLOCKER'&&x.args[0]?.op==='load'&&x.args[0].variable.name==='C'&&x.args[1]?.op==='symbol'&&x.args[1].name==='C-RTN'||r.name==='V-WALK'&&x.args[0]?.op==='load'&&x.args[0].variable.name==='PT'&&x.args[1]?.op==='symbol'&&x.args[1].name==='FEXITFCN');
          if(!allowed)fail('unclassified indirect call');visit(x,scope,targets);break;
        }
        case 'value':visit(e.variable,scope,targets);return;case 'random':visit(e.bound,scope,targets);return;case 'push':visit(e.value,scope,targets);return;
        case 'literal':case 'verify':case 'return-stack':return;
      }
      if('args' in e)for(const a of e.args)visit(a,scope,targets);
    };
    const scope=new Map<string,number>();bind(r.bindings,scope,[]);body(r.body,scope,[]);
  }
}
function validateBundleSources(bundle:GameBundle,fail:(s:string)=>never){
  const {sources:map,report,parser}=bundle.debug,logic=bundle.payload.logic;
  const files=new Map(map.files.map(f=>[f.file,f.text]));if(files.size!==map.files.length)fail('duplicate source files');
  const locations=new Map(map.locations.map(l=>[l.id,l]));if(locations.size!==map.locations.length)fail('duplicate locations');
  const positionMaps=new Map<string,{line:number;column:number}[]>();
  for(const [file,text] of files){const positions=[{line:1,column:1}];let line=1,column=1,cr=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='\r'){line++;column=1;cr=true;}else if(c==='\n'){if(!cr)line++;column=1;cr=false;}else{column++;cr=false;}positions.push({line,column});}positionMaps.set(file,positions);}
  for(const l of map.locations){const ps=positionMaps.get(l.file);if(!ps||l.end[0]<l.start[0]||ps[l.start[0]]?.line!==l.start[1]||ps[l.start[0]]?.column!==l.start[2]||ps[l.end[0]]?.line!==l.end[1]||ps[l.end[0]]?.column!==l.end[2])fail('invalid source position');}
  const anchors=new Set(map.anchors.map(a=>a.id));if(anchors.size!==map.anchors.length||map.anchors.some(a=>!locations.has(a.location)))fail('invalid source anchors');
  const names=new Map(bundle.payload.symbols.symbols.filter(s=>s.kind==='routine').map(s=>[s.name,s.number])),excluded=new Map(logic.excluded.map(e=>[e.name,e.policy])),nodes=new Map<string,{entry:LogicSourceMap['entries'][number];point:LogicSourceMap['entries'][number]['points'][number]}>(),entries=new Set<string>();
  for(const entry of map.entries){if(entries.has(entry.id)||names.get(entry.routine)!==entry.routineId||!anchors.has(entry.anchor))fail('invalid source-map entry');entries.add(entry.id);
    for(const point of entry.points){if(nodes.has(point.nodeId)||!locations.has(point.location)||point.policy!==(excluded.get(entry.routine) ?? 'runtime'))fail('invalid source point');nodes.set(point.nodeId,{entry,point});for(const origin of point.origin ?? [])if(!locations.has(origin.call)||origin.definition!==undefined&&!locations.has(origin.definition))fail('invalid macro origin');}
  }
  for(const n of map.normalizations)if(!locations.has(n.location))fail('invalid normalization source');
  let runtimePoints=0;
  for(const r of logic.routines)for(const s of mappedSites(r)){
    const node=nodes.get(s.value.nodeId as string);const kind=s.value.op==='evaluate'?'command':'slot' in s.value?'binding':Array.isArray(s.value.bindings)&&'name' in s.value?'routine':'expression';
    if(!node||node.entry.kind!==kind||node.entry.id!==s.value.sourceMapId||node.entry.routine!==r.name||node.point.path!==s.path||node.point.policy!=='runtime')fail('missing runtime source-map point');
    if(canonicalJson(sourceLocationSpan(locations.get(node!.point.location)!))!==canonicalJson(s.value.source))fail('source span mismatch');
    const origin=node!.point.origin?.map(o=>({macro:o.macro,call:sourceLocationSpan(locations.get(o.call)!),...(o.definition?{definition:sourceLocationSpan(locations.get(o.definition)!)}:{})}));
    if(canonicalJson(origin ?? null)!==canonicalJson(s.value.origin ?? null))fail('macro origin mismatch');runtimePoints++;
  }
  if(runtimePoints!==[...nodes.values()].filter(n=>n.point.policy==='runtime').length)fail('orphan runtime source-map point');
  if(logic.adapter)for(const r of [logic.adapter.entry,logic.adapter.checks,logic.adapter.noVerb,logic.adapter.notHere]){
    const middle=r===logic.adapter.noVerb||r===logic.adapter.notHere,policy=middle?'replaced-middle':'adapter',name=r===logic.adapter.notHere?'GET-OBJECT':'SYNTAX-CHECK';
    if((middle?(r.name!==name||names.get(r.name)!==r.id||excluded.get(r.name)!=='replaced-middle'):(r.id!==logic.adapter.id||r.name!==logic.adapter.name))||r.required!==(r===logic.adapter.notHere?1:0)||r.optional!==(r===logic.adapter.notHere?1:0))fail('invalid parser fragment identity');
    for(const s of mappedSites(r)){
      const node=nodes.get(s.value.nodeId as string),kind=s.value.op==='evaluate'?'command':'slot' in s.value?'binding':Array.isArray(s.value.bindings)&&'name' in s.value?'routine':'expression';
      if(!node||node.entry.id!==s.value.sourceMapId||node.entry.kind!==kind||node.entry.routine!==r.name||node.point.policy!==policy)fail('missing adapter source-map point');
      if(canonicalJson(sourceLocationSpan(locations.get(node!.point.location)!))!==canonicalJson(s.value.source))fail('adapter source span mismatch');
      const origin=node!.point.origin?.map(o=>({macro:o.macro,call:sourceLocationSpan(locations.get(o.call)!),...(o.definition?{definition:sourceLocationSpan(locations.get(o.definition)!)}:{})}));
      if(canonicalJson(origin ?? null)!==canonicalJson(s.value.origin ?? null))fail('adapter macro origin mismatch');
    }
  }
  const refs=(points:{sourceMapId:string;nodeId:string}[],routine:string)=>{for(const p of points){const n=nodes.get(p.nodeId);if(n?.entry.id!==p.sourceMapId||n.entry.routine!==routine)fail('invalid translation-report reference');}};
  for(const replacement of report.replacements)refs([replacement],replacement.routine);for(const row of [...report.parserConsumers,...report.reads,...report.unsupportedHost])refs(row.points,row.routine);
  const same=(a:unknown,b:unknown,label:string)=>{if(canonicalJson(a)!==canonicalJson(b))fail(label);};
  same(report.replacements.map(r=>[r.routine,r.policy]),logic.excluded.map(e=>[e.name,e.policy]),'incomplete replacement report');
  if(parser){same(parser.runtimeRoutineIds,logic.routines.map(r=>r.id),'parser runtime partition');if(parser.adapterRoutineId!==logic.adapter?.id)fail('parser adapter ID mismatch');same(report.parserConsumers.map(({points,...r})=>r),parser.consumers,'consumer report coverage');same(report.reads.map(({points,...r})=>r),parser.reads,'READ report coverage');for(const v of parser.routineValues)if(!names.has(v.name)||excluded.has(v.name))fail('invalid parser routine value');for(const site of parser.indirect)for(const name of site.targets)if(!names.has(name)||excluded.has(name))fail('invalid indirect target');}
  else if(logic.adapter||logic.excluded.length||report.parserConsumers.length||report.reads.length)fail('missing parser partition');
  const streams=logic.routines.flatMap(r=>[...logicExpressions(r)].filter(e=>e.op==='unsupported-host').map(e=>[r.name,e.operator]));same(report.unsupportedHost.map(e=>[e.routine,e.operator]),streams,'stream report coverage');
}

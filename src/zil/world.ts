import type { Node, Sequence, Span } from './ast.ts';
import { atomName, head } from './ast.ts';
import { print } from './printer.ts';
import { ZilError } from './diagnostics.ts';
import { decodeZilText } from './text.ts';
import type { SymbolAnalysis, SymbolDefinition, SymbolKind } from './symbols.ts';

export interface EntityReference { name:string; id:number }
export interface RoutineReference { name:string; id:number }
export interface WordReference { name:string; dictionaryIndex:number }
export interface NamedNumber { name:string; number:number }
interface PropertyBase { property:NamedNumber; byteLength:number; source:Span }
export type WorldProperty =
  | PropertyBase & {kind:'number';value:number}
  | PropertyBase & {kind:'text';text:string}
  | PropertyBase & {kind:'routine';routine:RoutineReference|null}
  | PropertyBase & {kind:'words';words:WordReference[]}
  | PropertyBase & {kind:'adjectives';adjectives:NamedNumber[]}
  | PropertyBase & {kind:'objects';objects:EntityReference[]}
  | PropertyBase & {kind:'pseudos';entries:{word:WordReference;routine:RoutineReference}[]};
export interface PendingExit { property:NamedNumber; declaration:string; source:Span }
export interface WorldEntity {
  name:string;id:number;kind:'room'|'object';source:Span;
  parent:EntityReference|null;parentSource:Span|null;
  shortName:{text:string;source:Span|null};flags:NamedNumber[];flagsSource:Span|null;
  properties:WorldProperty[];pendingExits:PendingExit[];
}
export interface WorldMetadata {
  format:'zxr-world-v1';semantics:'zxr-zork2-semantics-v1';stage:'metadata';
  counts:{rooms:number;objects:number;properties:number;pendingExits:number};
  propertyDefaults:{number:number;name:string|null;value:number;source:Span|null}[];
  entities:WorldEntity[];
}

/** Source-driven declaration lowering. Exit bytes, tables and runtime memory are later stages. */
export function compileWorldMetadata(forms:readonly Node[],analysis:SymbolAnalysis):WorldMetadata {
  if(analysis.diagnostics.length){const d=analysis.diagnostics[0]!;throw new ZilError(d.code,d.message,d.span);}
  const symbols=new Map(analysis.symbols.map(s=>[s.name,s]));
  const fail=(message:string,site:Node|Span):never=>{throw new ZilError('ZIL006',message,'span' in site?site.span:site);};
  const symbol=(name:string,kinds:readonly SymbolKind[],node:Node):SymbolDefinition=>{
    const s=symbols.get(name);if(!s||!kinds.includes(s.kind))return fail(`Expected ${kinds.join('/')} ${name}`,node);return s;
  };
  const number=(s:SymbolDefinition,node:Node):number=>s.number ?? fail(`Unallocated number for ${s.name}`,node);
  const name=(n:Node):string=>atomName(n) ?? fail('Expected an atom name',n);
  const property=(n:Node):NamedNumber=>{const v=name(n),s=symbol('P?'+v,['property'],n);return {name:v,number:number(s,n)};};
  const entity=(n:Node):EntityReference=>{const s=symbol(name(n),['room','object'],n);return {name:s.name,id:number(s,n)};};
  const routine=(n:Node):RoutineReference=>{const s=symbol(name(n),['routine'],n);return {name:s.name,id:number(s,n)};};
  const word=(n:Node):WordReference=>{
    const v=n.kind==='string'?n.value.toUpperCase():name(n),canonical=({'.':'PERIOD',',':'COMMA','"':'QUOTE'} as Record<string,string>)[v] ?? v;
    const s=symbol('W?'+canonical,['word'],n);if(s.dictionaryIndex===undefined)return fail(`Missing dictionary index for ${canonical}`,n);
    return {name:canonical,dictionaryIndex:s.dictionaryIndex};
  };
  const literal=(n:Node):number=>{
    if(n.kind==='number')return n.value&0xffff;
    if(n.kind==='form'&&!n.items.length)return 0;
    const ref=n.kind==='prefix'&&n.operator==='global'?n.value:n;
    const s=symbol(name(ref),['constant','builtin','property','attribute'],n);return number(s,n);
  };
  const text=(n:Node):string=>n.kind==='string'?decodeZilText(n.value):fail('Expected a string',n);
  const entities:WorldEntity[]=[],defaults=new Map<number,{number:number;name:string|null;value:number;source:Span|null}>();
  for(let i=1;i<=31;i++)defaults.set(i,{number:i,name:analysis.symbols.find(s=>s.kind==='property'&&s.number===i)?.name.slice(2) ?? null,value:0,source:null});
  for(const node of forms){
    if(head(node)==='PROPDEF'){
      const f=node as Sequence;if(f.items.length!==3)return fail('PROPDEF requires a name and default',node);
      const p=property(f.items[1]!);defaults.set(p.number,{number:p.number,name:p.name,value:literal(f.items[2]!),source:node.span});continue;
    }
    if(!['ROOM','OBJECT'].includes(head(node) ?? ''))continue;
    const f=node as Sequence,ref=entity(f.items[1]!);
    const e:WorldEntity={...ref,kind:head(node)==='ROOM'?'room':'object',source:node.span,parent:null,parentSource:null,shortName:{text:'',source:null},flags:[],flagsSource:null,properties:[],pendingExits:[]};
    const seen=new Set<string>();
    for(const n of f.items.slice(2)){
      if(n.kind!=='list'||!n.items.length)return fail('Expected a nonempty object property list',n);
      const key=name(n.items[0]!),args=n.items.slice(1),location=key==='IN'&&args.length===1&&args[0]?.kind==='atom';
      const identity=location?'@location':key;if(seen.has(identity))return fail(`Duplicate ${key} on ${e.name}`,n);seen.add(identity);
      const arity=(count:number)=>{if(args.length!==count)fail(`${key} requires ${count} value(s)`,n);};
      if(location){e.parent=entity(args[0]!);e.parentSource=n.span;continue;}
      if(key==='DESC'){arity(1);e.shortName={text:text(args[0]!),source:n.span};continue;}
      if(key==='FLAGS'){
        const flags=new Set<number>();e.flags=args.map(a=>{const s=symbol(name(a),['attribute'],a),v=number(s,a);if(flags.has(v))fail(`Duplicate flag ${s.name}`,a);flags.add(v);return {name:s.name,number:v};}).sort((a,b)=>a.number-b.number);e.flagsSource=n.span;continue;
      }
      const p=property(n.items[0]!);
      if(p.number >= (symbols.get('LOW-DIRECTION')?.number ?? 32)){
        e.pendingExits.push({property:p,declaration:print(n),source:n.span});continue;
      }
      const base={property:p,source:n.span};let value:WorldProperty;
      if(['LDESC','FDESC','TEXT'].includes(key)){arity(1);value={...base,kind:'text',text:text(args[0]!),byteLength:2};}
      else if(['SIZE','CAPACITY','VALUE','TVALUE','VTYPE','STRENGTH'].includes(key)){arity(1);value={...base,kind:'number',value:literal(args[0]!),byteLength:2};}
      else if(['ACTION','DESCFCN','CONTFCN','ADVFCN'].includes(key)){arity(1);value={...base,kind:'routine',routine:args[0]?.kind==='number'&&args[0].value===0?null:routine(args[0]!),byteLength:2};}
      else if(key==='SYNONYM')value={...base,kind:'words',words:args.map(word),byteLength:args.length*2};
      else if(key==='ADJECTIVE')value={...base,kind:'adjectives',adjectives:args.map(a=>{const s=symbol('A?'+name(a),['adjective'],a);return {name:name(a),number:number(s,a)};}),byteLength:args.length};
      else if(key==='GLOBAL')value={...base,kind:'objects',objects:args.map(entity),byteLength:args.length};
      else if(key==='PSEUDO'){
        if(args.length%2)return fail('PSEUDO requires word/routine pairs',n);
        const entries:{word:WordReference;routine:RoutineReference}[]=[];
        for(let i=0;i<args.length;i+=2)entries.push({word:word(args[i]!),routine:routine(args[i+1]!)});
        value={...base,kind:'pseudos',entries,byteLength:entries.length*4};
      } else return fail(`Unsupported object property ${key}`,n);
      if(value.byteLength<1||value.byteLength>8)return fail(`${key} exceeds the V3 property size (1..8 bytes): ${value.byteLength}`,n);
      e.properties.push(value);
    }
    e.properties.sort((a,b)=>b.property.number-a.property.number);e.pendingExits.sort((a,b)=>b.property.number-a.property.number);entities.push(e);
  }
  entities.sort((a,b)=>a.id-b.id);
  const byName=new Map(entities.map(e=>[e.name,e]));
  for(const e of entities){
    const visited=new Set<string>();let current:WorldEntity|undefined=e;
    while(current){if(visited.has(current.name))return fail(`Initial containment cycle at ${current.name}`,e.parentSource ?? e.source);visited.add(current.name);
      if(!current.parent)break;
      const target=byName.get(current.parent.name);if(!target||target.id!==current.parent.id)return fail(`Missing initial parent ${current.parent.name}`,current.parentSource ?? current.source);current=target;
    }
  }
  return {format:'zxr-world-v1',semantics:'zxr-zork2-semantics-v1',stage:'metadata',
    counts:{rooms:entities.filter(e=>e.kind==='room').length,objects:entities.filter(e=>e.kind==='object').length,properties:entities.reduce((n,e)=>n+e.properties.length,0),pendingExits:entities.reduce((n,e)=>n+e.pendingExits.length,0)},
    propertyDefaults:[...defaults.values()],entities};
}

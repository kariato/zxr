import { children, isComment } from './ast.ts';
import type { MacroOrigin, Node, Span } from './ast.ts';
import { read } from './reader.ts';
import { decodeZilText } from './text.ts';
import { assertFullyLoweredLogic, logicExpressions } from './logic.ts';
import type { LinkedLogic, LogicRoutine } from './logic.ts';
import type { ParserProgram, ParserSplit } from './parser.ts';
import { ZilError } from './diagnostics.ts';

export interface SourcePoint {sourceMapId:string;nodeId:string}
export type SourceMapped<T> = T extends (infer U)[] ? SourceMapped<U>[] : T extends object ? {[K in keyof T]:SourceMapped<T[K]>}&(T extends {source:Span}?SourcePoint:unknown):T;
export type MappedRoutine=SourceMapped<LogicRoutine>;
type Kind='routine'|'binding'|'command'|'expression';
type Policy='runtime'|'adapter'|'replaced-middle';
export interface MapPoint {nodeId:string;path:string;location:number;origin?:{macro:string;call:number;definition?:number}[];policy:Policy;normalizations?:string[];generated?:string}
export interface SourceMapEntry {id:string;routine:string;routineId:number;kind:Kind;anchor:string;role:string;semanticHash:string;points:MapPoint[]}
export interface SourceLocation {id:number;file:string;start:[number,number,number];end:[number,number,number]}
export interface LogicSourceMap {
  format:'zxr-source-map-v1';semantics:'zxr-zork2-semantics-v1';identity:'semantic-form-v1';
  files:{file:string;text:string}[];locations:SourceLocation[];anchors:{id:string;location:number}[];entries:SourceMapEntry[];
  normalizations:{rule:string;location:number}[];
}
export interface TranslationReport {
  format:'zxr-translation-report-v1';untranslated:never[];
  replacements:{routine:string;policy:'adapter'|'replaced-middle';sourceMapId:string;nodeId:string}[];
  parserConsumers:(ParserSplit['consumers'][number]&{points:SourcePoint[]})[];
  reads:(ParserSplit['reads'][number]&{points:SourcePoint[]})[];
  unsupportedHost:{routine:string;operator:string;points:SourcePoint[]}[];
}
export interface SourceMappedProgram {format:'zxr-source-program-v1';semantics:'zxr-zork2-semantics-v1';routines:MappedRoutine[];strings:LinkedLogic['strings'];parser:ParserSplit|null}
export interface SourceMapResult {program:SourceMappedProgram;referenceRoutines:MappedRoutine[];sources:LogicSourceMap;report:TranslationReport}
const spanKey=(s:Span)=>JSON.stringify([s.file,s.start.offset,s.end.offset]);
/** A deterministic non-security identifier. Full keys are collision-checked within each build. */
function fingerprint(text:string):string {
  let a=2166136261,b=3339675911;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
const json=(value:unknown)=>JSON.stringify(value);
const ignored=new Set(['source','origin','sourceMapId','nodeId']);
function canonicalNode(n:Node):unknown {
  if(isComment(n))return null;
  if(n.kind==='form'||n.kind==='list'||n.kind==='vector')return [n.kind,n.items.filter(n=>!isComment(n)).map(canonicalNode)];
  if(n.kind==='prefix')return [n.kind,n.operator,canonicalNode(n.value)];
  if(n.kind==='typed')return [n.kind,canonicalNode(n.tag),canonicalNode(n.value)];
  return [n.kind,n.kind==='string'?decodeZilText(n.value):'value' in n?n.value:null];
}
function kind(value:Record<string,unknown>):Kind {
  if(Array.isArray(value.bindings)&&typeof value.name==='string'&&typeof value.id==='number')return 'routine';
  if(value.op==='evaluate')return 'command';
  if(typeof value.slot==='number'&&'initializer' in value)return 'binding';
  if(typeof value.op==='string')return 'expression';
  throw new Error('Source maps: unknown source-bearing IR node');
}
/** Only source-bearing compiler sites; variables, branch containers and target records are not instructions. */
export function* mappedSites(value:unknown,path=''):Generator<{value:Record<string,unknown>&{source:Span};path:string}> {
  if(Array.isArray(value)){for(const [i,v] of value.entries())yield* mappedSites(v,`${path}[${i}]`);return;}
  if(!value||typeof value!=='object')return;const object=value as Record<string,unknown>;
  if(object.source)yield {value:object as Record<string,unknown>&{source:Span},path};
  for(const key of Object.keys(object).filter(k=>!ignored.has(k)).sort())yield* mappedSites(object[key],path?path+'.'+key:key);
}
export function stripSourceMapIds(value:unknown):unknown {
  if(Array.isArray(value))return value.map(stripSourceMapIds);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='sourceMapId'&&k!=='nodeId').map(([k,v])=>[k,stripSourceMapIds(v)]));return value;
}

/** Map all reference routines, retaining only the parser partition's executable view in program.routines. */
export function mapLogicSources(logic:LinkedLogic,files:ReadonlyMap<string,string>,options:{parser?:ParserProgram;forms?:readonly Node[]}={}):SourceMapResult {
  assertFullyLoweredLogic(logic);
  const fallback=logic.routines[0]?.source;if(!fallback)throw new Error('Source maps require at least one routine');
  const fail=(message:string,source=fallback):never=>{throw new ZilError('ZIL013',message,source);};
  const sources:LogicSourceMap={format:'zxr-source-map-v1',semantics:logic.semantics,identity:'semantic-form-v1',files:[...files].map(([file,text])=>({file,text})),locations:[],anchors:[],entries:[],normalizations:[]};
  const catalog=new Map<string,{node:Node;anchor:Node;role:string}>(),positions=new Map<string,{line:number;column:number}[]>();
  for(const [file,text] of files){
    const ps=[{line:1,column:1}];let line=1,column=1,afterCR=false;
    for(const c of text.split('')){if(c==='\r'){line++;column=1;afterCR=true;}else if(c==='\n'){if(!afterCR)line++;column=1;afterCR=false;}else{column++;afterCR=false;}ps.push({line,column});}positions.set(file,ps);
    const scan=(n:Node,anchor:Node=n,role='source')=>{
      const ordinaryForm=n.kind==='form'&&!['ROUTINE','DEFMAC','DEFINE'].includes(n.items[0]?.kind==='atom'?n.items[0].value:'');
      if(ordinaryForm){anchor=n;role='source';}
      catalog.set(spanKey(n.span),{node:n,anchor,role});
      for(const [i,c] of children(n).filter(c=>!isComment(c)).entries())scan(c,ordinaryForm?anchor:anchor===n?c:anchor,ordinaryForm?`item:${i}`:anchor===n?'source':role+`/item:${i}`);
    };
    for(const n of read(text,file).nodes)scan(n);
  }
  const locationIds=new Map<string,number>();
  const location=(span:Span)=>{
    const key=spanKey(span),prior=locationIds.get(key);if(prior!==undefined)return prior;
    const text=files.get(span.file),ps=positions.get(span.file);
    if(text===undefined||!ps||span.start.offset<0||span.end.offset<span.start.offset||span.end.offset>text.length||!Number.isInteger(span.start.offset)||!Number.isInteger(span.end.offset)||json(ps[span.start.offset])!==json({line:span.start.line,column:span.start.column})||json(ps[span.end.offset])!==json({line:span.end.line,column:span.end.column}))return fail('Invalid or missing source span',span);
    const id=sources.locations.length+1;sources.locations.push({id,file:span.file,start:[span.start.offset,span.start.line,span.start.column],end:[span.end.offset,span.end.line,span.end.column]});locationIds.set(key,id);return id;
  };
  const normalizationSites=new Map<string,string[]>();
  const scanNormalizations=(nodes:readonly Node[])=>{for(const n of nodes){if(n.semantic?.kind.startsWith('reference-normalization:')){
    const rule=n.semantic.kind.slice('reference-normalization:'.length),key=spanKey(n.span),rules=normalizationSites.get(key) ?? [];if(!rules.includes(rule)){rules.push(rule);sources.normalizations.push({rule,location:location(n.span)});}normalizationSites.set(key,rules);
  }scanNormalizations(children(n));}};scanNormalizations(options.forms ?? []);
  const idKeys=new Map<string,string>(),anchors=new Map<string,string>(),entries=new Map<string,SourceMapEntry>();
  const identity=(prefix:string,key:string)=>{const id=prefix+fingerprint(key),old=idKeys.get(id);if(old!==undefined&&old!==key)return fail('Source-map identifier collision; change identity version');idKeys.set(id,key);return id;};
  const anchor=(node:Node)=>{
    const canonical=json(canonicalNode(node)),key=json([node.span.file,canonical]),id=identity('a1:',key);
    if(!anchors.has(id)){anchors.set(id,key);sources.anchors.push({id,location:location(node.span)});}return id;
  };
  const strings=new Map(logic.strings.entries.map(e=>[e.id,e.text]));
  let localIdentities=new Map<number,string>(),blockIdentities=new Map<number,string>();
  // Discard relocated IDs/addresses and positions; preserve symbolic targets and actual text/values.
  const semantic=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(semantic);
    if(!value||typeof value!=='object')return value;
    const o=value as Record<string,unknown>;
    if(o.scope==='local'&&typeof o.number==='number')return {scope:'local',name:o.name,binding:localIdentities.get(o.number) ?? fail('Missing local binding identity')};
    if(o.kind==='block'&&typeof o.id==='number'&&!o.op)return {kind:'block',block:blockIdentities.get(o.id) ?? fail('Missing block target identity')};
    if(o.op==='string'){if(!strings.has(o.handle as number))return fail('Unknown string handle in mapped logic');return {op:'string',text:strings.get(o.handle as number)};}
    if(o.op==='address')return o.tableConstructor?{op:o.op,tableConstructor:o.tableConstructor}:{op:o.op,name:o.name};
    return Object.fromEntries(Object.keys(o).filter(k=>!ignored.has(k)&&k!=='id'&&!(k==='slot'&&'initializer' in o)&&!(k==='number'&&'scope' in o)&&!(k==='value'&&o.op==='symbol'&&o.kind==='routine')).sort().map(k=>[k,semantic(o[k])]));
  };
  const policyFor=(r:LogicRoutine):Policy=>options.parser?.partition.routines.find(p=>p.name===r.name)?.policy==='adapter'?'adapter':options.parser?.partition.routines.find(p=>p.name===r.name)?.policy==='replaced-middle'?'replaced-middle':'runtime';
  type Context={anchor:string;rootPath:string;sourceKey:string;macro:boolean;role:string};
  const referenceRoutines=logic.routines.map(r=>{
    localIdentities=new Map();blockIdentities=new Map();
    for(const s of mappedSites(r))if(kind(s.value)==='binding'||s.value.op==='block'){
      const data=catalog.get(spanKey(s.value.source));if(!data)return fail('Missing binding/block source anchor',s.value.source);
      const key=json([s.value.name ?? s.value.kind,canonicalNode(data.anchor),data.role]);
      if(kind(s.value)==='binding')localIdentities.set(s.value.slot as number,key);else blockIdentities.set(s.value.id as number,key);
    }
    let serial=0;
    const visit=(value:unknown,path:string,parent?:Context,parentObject?:Record<string,unknown>):unknown=>{
      if(Array.isArray(value))return value.map((v,i)=>visit(v,`${path}[${i}]`,parent,parentObject));
      if(!value||typeof value!=='object')return value;
      const o=value as Record<string,unknown>;let context=parent,point:SourcePoint|undefined;
      if(o.source){
        const source=o.source as Span,k=kind(o),sourceKey=spanKey(source),loc=location(source),data=catalog.get(sourceKey);
        if(!data)return fail('IR span has no original source node',source);
        if(k==='routine')context={anchor:anchor(data.node),rootPath:path,sourceKey,macro:false,role:'entry'};
        else if(parent&&(parent.macro||parent.sourceKey===sourceKey)&&parent.role!=='entry')context=parent;
        else context={anchor:anchor(data.anchor),rootPath:path,sourceKey,macro:Boolean((o.origin as MacroOrigin[]|undefined)?.length),role:data.role};
        const role=k==='routine'?'entry':context.role+path.slice(context.rootPath.length),key=json([r.name,k,k==='routine'?r.name:context.anchor,role,k==='routine'?r.name:semantic(o)]);
        const id=identity(`sm1:${encodeURIComponent(r.name)}:${k}:`,key),semanticHash=identity('s1:',json(k==='routine'?{entry:r.name}:semantic(o))),nodeId=`${encodeURIComponent(r.name)}:n${++serial}`;
        let entry=entries.get(id);if(!entry){entry={id,routine:r.name,routineId:r.id,kind:k,anchor:context.anchor,role,semanticHash,points:[]};entries.set(id,entry);sources.entries.push(entry);}
        const origin=(o.origin as MacroOrigin[]|undefined)?.map(m=>({macro:m.macro,call:location(m.call),...(m.definition?{definition:location(m.definition)}:{})}));
        let generated:string|undefined;
        if(k==='expression'&&o.op==='literal'&&parentObject?.op==='memory'&&parentObject.operator==='REST'&&sourceKey===spanKey(parentObject.source as Span)&&data.node.kind==='form'&&data.node.items.length===2)generated='SRC-010: omitted REST count defaults to one byte';
        else if(k==='expression'&&o.op==='literal'&&o.value===0&&parentObject&&'slot' in parentObject&&data.node.kind==='atom')generated='implicit zero initializer';
        const normalizations=normalizationSites.get(sourceKey);
        entry.points.push({nodeId,path,location:loc,...(origin?.length?{origin}:{}),policy:policyFor(r),...(normalizations?{normalizations}:{}),...(generated?{generated}:{})});point={sourceMapId:id,nodeId};
      }
      const copy=Object.fromEntries(Object.keys(o).filter(k=>k!=='sourceMapId'&&k!=='nodeId').map(k=>[k,ignored.has(k)?o[k]:visit(o[k],path?path+'.'+k:k,context,o.source?o:parentObject)]));
      return point?{...copy,...point}:copy;
    };
    return visit(r,'') as MappedRoutine;
  });
  // Numeric location/node IDs are build-local. Stable source IDs never use them.
  sources.entries.sort((a,b)=>a.id.localeCompare(b.id,'en'));sources.anchors.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const partition=options.parser?.partition ?? null,runtimeIds=partition?.runtimeRoutineIds ?? logic.routines.map(r=>r.id);
  if(options.parser&&json(options.parser.routines)!==json(logic.routines.filter(r=>runtimeIds.includes(r.id))))fail('Parser executable view differs from linked logic');
  const program:SourceMappedProgram={format:'zxr-source-program-v1',semantics:logic.semantics,routines:referenceRoutines.filter(r=>runtimeIds.includes(r.id)),strings:logic.strings,parser:partition};
  const pointsAt=(routine:string,span:Span,op?:string)=>{
    const mapped=referenceRoutines.find(r=>r.name===routine);if(!mapped)return fail('Missing mapped routine '+routine,span);
    const result=[...mappedSites(mapped)].filter(s=>spanKey(s.value.source)===spanKey(span)&&(!op||s.value.op===op)).map(s=>({sourceMapId:s.value.sourceMapId as string,nodeId:s.value.nodeId as string}));
    if(!result.length)return fail('Missing mapped translation-report site '+routine,span);return result;
  };
  const report:TranslationReport={format:'zxr-translation-report-v1',untranslated:[],replacements:(partition?.routines ?? []).filter(r=>r.policy!=='kept').map(r=>{
    const mapped=referenceRoutines.find(m=>m.id===r.id);if(!mapped)return fail('Missing replacement routine '+r.name,r.source);
    return {routine:r.name,policy:r.policy as 'adapter'|'replaced-middle',sourceMapId:mapped.sourceMapId,nodeId:mapped.nodeId};
  }),parserConsumers:(partition?.consumers ?? []).map(s=>({...s,points:pointsAt(s.routine,s.source,s.mode)})),reads:(partition?.reads ?? []).map(s=>({...s,points:pointsAt(s.routine,s.source,'suspend')})),unsupportedHost:logic.routines.flatMap(r=>[...logicExpressions(r)].filter(e=>e.op==='unsupported-host').map(e=>({routine:r.name,operator:e.operator,points:pointsAt(r.name,e.source,'unsupported-host')})))};
  const result={program,referenceRoutines,sources,report};validateMappedSources(result,logic);return result;
}

/** Fail closed for overlay targets: repeated identical forms require author disambiguation in source. */
export function resolveSourcePoint(map:LogicSourceMap,target:{routine:string;sourceMapId:string;within?:string}){
  const entries=map.entries.filter(e=>e.id===target.sourceMapId&&e.routine===target.routine);
  if(entries.length!==1)throw new Error('Missing or non-unique source-map target '+target.sourceMapId);
  const entry=entries[0]!;let candidates=entry.points;
  if(target.within){
    const context=map.entries.find(e=>e.id===target.within&&e.routine===target.routine);
    if(!context||context.points.length!==1||context.points[0]!.policy!=='runtime')throw new Error('Missing or ambiguous enclosing source-map target');
    const path=context.points[0]!.path;candidates=candidates.filter(p=>path===''||p.path===path||p.path.startsWith(path+'.')||p.path.startsWith(path+'['));
  }
  if(candidates.length!==1)throw new Error('Ambiguous or absent source-map target '+target.sourceMapId);
  const point=candidates[0]!;if(point.policy!=='runtime')throw new Error('Source-map target belongs to replaced parser code');
  const location=map.locations.find(l=>l.id===point.location);if(!location)throw new Error('Invalid source-map location');
  const source=sourceLocationSpan(location),file=map.files.find(f=>f.file===source.file);if(!file)throw new Error('Missing source-map file');
  return {entry,point,source,text:file.text.slice(source.start.offset,source.end.offset)};
}

/** Exact build-local diagnostic lookup, including ambiguous semantic IDs and excluded reference code. */
export function lookupSourceNode(map:LogicSourceMap,target:{routine:string;nodeId:string}){
  const matches=map.entries.filter(e=>e.routine===target.routine).flatMap(entry=>entry.points.filter(point=>point.nodeId===target.nodeId).map(point=>({entry,point})));
  if(matches.length!==1)throw new Error('Missing or duplicate source node '+target.nodeId);
  const {entry,point}=matches[0]!,location=map.locations.find(l=>l.id===point.location);if(!location)throw new Error('Invalid source-map location');
  const source=sourceLocationSpan(location),file=map.files.find(f=>f.file===source.file);if(!file)throw new Error('Missing source-map file');
  return {entry,point,source,text:file.text.slice(source.start.offset,source.end.offset)};
}

export function validateMappedSources(result:SourceMapResult,original:LinkedLogic):void {
  const fail=(m:string):never=>{throw new Error('Source-map coverage: '+m);};
  if(result.sources.format!=='zxr-source-map-v1'||result.sources.identity!=='semantic-form-v1'||result.sources.semantics!==original.semantics)fail('format/ABI mismatch');
  if(json(stripSourceMapIds(result.referenceRoutines))!==json(original.routines))fail('mapping changed reference logic');
  const entries=new Map(result.sources.entries.map(e=>[e.id,e]));if(entries.size!==result.sources.entries.length)fail('duplicate source-map IDs');
  const locations=new Map(result.sources.locations.map(l=>[l.id,l])),anchors=new Set(result.sources.anchors.map(a=>a.id)),seen=new Set<string>();let count=0;
  if(locations.size!==result.sources.locations.length||anchors.size!==result.sources.anchors.length)fail('duplicate locations/anchors');
  for(const r of result.referenceRoutines)for(const s of mappedSites(r)){
    const id=s.value.sourceMapId,nodeId=s.value.nodeId;if(typeof id!=='string'||typeof nodeId!=='string'||seen.has(nodeId))fail('missing/duplicate instruction instance ID');seen.add(nodeId as string);
    const e=entries.get(id as string),p=e?.points.filter(p=>p.nodeId===nodeId);if(!e||e.routine!==r.name||e.routineId!==r.id||e.kind!==kind(s.value)||!anchors.has(e.anchor)||p?.length!==1||p[0]!.path!==s.path||json(locations.has(p[0]!.location)?sourceLocationSpan(locations.get(p[0]!.location)!):undefined)!==json(s.value.source))fail('missing or mismatched instruction point');
    const point=p?.[0] ?? fail('missing point');
    const origin=point.origin?.map(m=>({macro:m.macro,call:locations.has(m.call)?sourceLocationSpan(locations.get(m.call)!):undefined,...(m.definition?{definition:locations.has(m.definition)?sourceLocationSpan(locations.get(m.definition)!):undefined}:{})}));if(json(origin)!==json(s.value.origin))fail('macro origin mismatch');count++;
  }
  if(count!==result.sources.entries.reduce((n,e)=>n+e.points.length,0))fail('orphan source-map points');
  const ids=result.program.parser?.runtimeRoutineIds ?? original.routines.map(r=>r.id);
  if(json(result.program.routines)!==json(result.referenceRoutines.filter(r=>ids.includes(r.id))))fail('runtime projection mismatch');
  const check=(point:SourcePoint)=>{if(!entries.get(point.sourceMapId)?.points.some(p=>p.nodeId===point.nodeId))fail('orphan report point');};
  for(const p of result.report.replacements)check(p);for(const row of [...result.report.parserConsumers,...result.report.reads,...result.report.unsupportedHost])for(const p of row.points)check(p);
  const partition=result.program.parser;
  if(json(result.report.replacements.map(r=>[r.routine,r.policy]))!==json((partition?.routines ?? []).filter(r=>r.policy!=='kept').map(r=>[r.name,r.policy])))fail('incomplete replacement report');
  const verifyRows=(rows:{routine:string;source:Span;points:SourcePoint[]}[],expected:unknown,op:(row:{routine:string;source:Span;points:SourcePoint[];mode?:string})=>string)=>{
    if(json(rows.map(({points,...rest})=>rest))!==json(expected))fail('incomplete consumer/READ report');
    for(const row of rows){const r=result.referenceRoutines.find(r=>r.name===row.routine)!;
      const expectedPoints=[...mappedSites(r)].filter(s=>spanKey(s.value.source)===spanKey(row.source)&&s.value.op===op(row)).map(s=>({sourceMapId:s.value.sourceMapId,nodeId:s.value.nodeId}));
      if(json(row.points)!==json(expectedPoints)||!row.points.length)fail('misdirected report points');
    }
  };
  verifyRows(result.report.parserConsumers,partition?.consumers ?? [],row=>row.mode ?? '');
  verifyRows(result.report.reads,partition?.reads ?? [],()=> 'suspend');
  const unsupported=original.routines.flatMap(r=>[...logicExpressions(r)].filter(e=>e.op==='unsupported-host').map(e=>[r.name,e.operator]));
  if(json(result.report.unsupportedHost.map(e=>[e.routine,e.operator]))!==json(unsupported))fail('incomplete unsupported-host report');
  for(const e of result.sources.entries)for(const p of e.points){const policy=partition?.routines.find(r=>r.name===e.routine)?.policy;const expected=policy==='adapter'||policy==='replaced-middle'?policy:'runtime';if(p.policy!==expected)fail('parser point policy mismatch');}
  if(result.report.untranslated.length)fail('untranslated constructs remain');
}

export function sourceLocationSpan(location:SourceLocation):Span {
  const pos=(p:[number,number,number])=>({offset:p[0],line:p[1],column:p[2]});
  return {file:location.file,start:pos(location.start),end:pos(location.end)};
}

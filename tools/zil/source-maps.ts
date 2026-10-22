import { loadProgram, mapLogicSources, mappedSites, sourceLocationSpan, splitParserLibrary, validateMappedSources } from '../../src/zil/index.ts';
import type { SourceMapResult, LinkedLogic, LogicSourceMap } from '../../src/zil/index.ts';
import { buildMemory } from './memory.ts';
import { worldSymbolAnalysis } from './world.ts';
import { sourceFiles } from './program.ts';
import { sha256 } from '../reference/symbols.ts';
export function buildSourceMapProgram(){
  const {logic,memory}=buildMemory(),parser=splitParserLibrary(logic,memory),{forms}=worldSymbolAnalysis();
  return {result:mapLogicSources(logic,sourceFiles(),{parser,forms}),logic};
}
/** One compact row per record keeps source maps reviewable without deeply indented repeated metadata. */
export function serializeSourceMap(map:LogicSourceMap){
  return '{\n'+Object.entries(map).map(([key,value])=>'  '+JSON.stringify(key)+': '+(Array.isArray(value)?'[\n'+value.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]':JSON.stringify(value))).join(',\n')+'\n}\n';
}
export function auditSourceMaps(result:SourceMapResult,logic:LinkedLogic){
  validateMappedSources(result,logic);
  const equal=(a:unknown,b:unknown,label:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Source-map audit: '+label+' differs');};
  const files=sourceFiles(),definitions=loadProgram(files).definitions;
  equal(result.sources.files,[...files].map(([file,text])=>({file,text})),'all original source files');
  const locations=new Map(result.sources.locations.map(l=>[l.id,l]));let macroPoints=0,originLinks=0;
  for(const entry of result.sources.entries)for(const point of entry.points){
    if(point.origin?.length)macroPoints++;
    for(const origin of point.origin ?? []){
      const definition=definitions.get(origin.macro);if(!definition||origin.definition===undefined)throw new Error('Source-map audit: missing macro definition '+origin.macro);
      equal(sourceLocationSpan(locations.get(origin.definition)!),definition.span,'macro definition '+origin.macro);originLinks++;
    }
  }
  const classify=(value:Record<string,unknown>)=>value.op==='evaluate'?'command':'slot' in value?'binding':Array.isArray(value.bindings)&&'name' in value?'routine':'expression';
  const counts=(routines:readonly unknown[])=>{const rows=routines.flatMap(r=>[...mappedSites(r)]);return Object.fromEntries(['routine','binding','command','expression'].map(k=>[k,rows.filter(s=>classify(s.value)===k).length]));};
  equal(counts(result.referenceRoutines),counts(logic.routines),'complete site-kind coverage');
  equal(result.report.replacements.map(r=>[r.routine,r.policy]),result.program.parser?.routines.filter(r=>r.policy!=='kept').map(r=>[r.name,r.policy]),'replacement report');
  const allPoints=result.sources.entries.flatMap(e=>e.points),report=result.report;
  return {format:'zxr-source-map-audit-v1',sourceHashes:[...files].map(([file,text])=>({file,sha256:sha256(text)})),sourceMapSha256:sha256(serializeSourceMap(result.sources)),mappedLogicSha256:sha256(JSON.stringify(result.program)),reportSha256:sha256(JSON.stringify(report)),
    checked:{routines:logic.routines.length,runtimeRoutines:result.program.routines.length,sites:allPoints.length,byKind:counts(result.referenceRoutines),stableIds:result.sources.entries.length,ambiguousIds:result.sources.entries.filter(e=>e.points.length>1).length,locations:result.sources.locations.length,anchors:result.sources.anchors.length,macroPoints,originLinks,normalizations:result.sources.normalizations.length,generatedRestDefaults:allPoints.filter(p=>p.generated?.startsWith('SRC-010')).length,implicitZeroInitializers:allPoints.filter(p=>p.generated==='implicit zero initializer').length,untranslated:report.untranslated.length,replacements:report.replacements.length,parserConsumers:report.parserConsumers.length,readSites:report.reads.length,unsupportedHostSites:report.unsupportedHost.length},
    limits:['Stable IDs use routine names, canonical semantic source forms, lowering roles and symbolic IR semantics. Addresses, routine/string/variable/block numbers and source positions do not identify overlay points.',
      'A repeated identical semantic point shares an ID. Overlay lookup requires a unique runtime point, optionally inside one unique semantic ancestor. Missing, ambiguous or excluded targets fail; no occurrence number or nearest-line fallback.',
      'Location IDs and exact node IDs are deterministic build-local diagnostics, not persistent overlay identities. File contents are stored once; compact positions are [UTF-16 offset, line, column], with exclusive ends.',
      'Identifier fingerprints are non-security hashes; full semantic keys are collision-checked at generation. SHA-256 audit hashes cover the emitted artifacts. Full schemas, bundle validation and runtime diagnostics remain later steps.']};
}

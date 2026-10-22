import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, expandMacros, head, loadProgram, lookupSourceNode, mapLogicSources, mappedSites, resolveSourcePoint, sourceLocationSpan, stripSourceMapIds, translateLogic, validateMappedSources } from '../src/zil/index.ts';
import type { LinkedLogic, LogicExpression, Sequence, SourceMapResult } from '../src/zil/index.ts';
import { auditSourceMaps, buildSourceMapProgram, serializeSourceMap } from '../tools/zil/source-maps.ts';
const built=buildSourceMapProgram(),result=built.result;
function compile(source:string){
  const files=new Map([['zork2.zil',source]]),p=loadProgram(files),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const declarations=(op:string)=>p.forms.filter(n=>head(n)===op).map(n=>((n as Sequence).items[1] as {value:string}).value);
  const analysis=analyzeSymbols(p,expanded.forms,{objects:[],globals:declarations('GLOBAL'),routines:declarations('ROUTINE'),words:[],constants:{}}),operations=translateLogic(expanded.forms,analysis);
  const logic:LinkedLogic={...operations,stage:'linked'};return {logic,files,mapped:mapLogicSources(logic,files,{forms:expanded.forms})};
}
const ids=(r:SourceMapResult,name='F')=>r.sources.entries.filter(e=>e.routine===name).map(e=>e.id);
const first=(r:SourceMapResult,op:string,name='F')=>[...mappedSites(r.referenceRoutines.find(r=>r.name===name)!)].find(s=>s.value.op===op)!.value as unknown as {sourceMapId:string;nodeId:string};

describe('semantic source-map identities and complete translation report',()=>{
  it('maps all reference/runtime nodes deterministically and audits every macro definition',()=>{
    const audit=auditSourceMaps(result,built.logic);
    expect(audit.checked).toEqual({routines:439,runtimeRoutines:414,sites:26503,byKind:{routine:439,binding:487,command:6487,expression:19090},stableIds:24399,ambiguousIds:1424,locations:16164,anchors:6250,macroPoints:8102,originLinks:8102,normalizations:2,generatedRestDefaults:1,implicitZeroInitializers:211,untranslated:0,replacements:25,parserConsumers:32,readSites:3,unsupportedHostSites:3});
    expect(audit).toEqual(JSON.parse(readFileSync('reference/source-map-audit.json','utf8')));
    expect(serializeSourceMap(result.sources)).toBe(readFileSync('games/zork2/source-map.zxr.json','utf8'));
    expect(result.report).toEqual(JSON.parse(readFileSync('reference/translation-report.json','utf8')));
    expect(stripSourceMapIds(result.referenceRoutines)).toEqual(built.logic.routines);
    expect(serializeSourceMap(buildSourceMapProgram().result.sources)).toBe(serializeSourceMap(result.sources));
  });
  it('keeps semantic IDs across whitespace, comments, line endings and numeric spelling changes',()=>{
    const a=compile('<ROUTINE F (X) <+ .X 8> <PRINTI "same">>'),b=compile(';"prefix"\r\n<ROUTINE F (X)\r\n\t<+ ;"ignore" .X *10*>\r\n <PRINTI "same">>');
    expect(ids(a.mapped)).toEqual(ids(b.mapped));
    const target=first(a.mapped,'primitive');
    expect(resolveSourcePoint(b.mapped.sources,{routine:'F',sourceMapId:target.sourceMapId}).source.start.line).toBe(3);
  });
  it('survives unrelated sibling/routine insertion, string-handle shifts and routine renumbering',()=>{
    const a=compile('<ROUTINE F (X) <PRINTI "same"> <+ .X 1>>'),b=compile('<ROUTINE G () <PRINTI "earlier">> <ROUTINE F (X) <CRLF> <PRINTI "same"> <+ .X 1>>');
    expect(a.logic.routines[0]!.id).not.toBe(b.logic.routines.find(r=>r.name==='F')!.id);
    expect(b.logic.strings.entries[0]!.text).toBe('earlier');
    for(const id of ids(a.mapped))expect(ids(b.mapped)).toContain(id);
    const sourceMapId=first(a.mapped,'output').sourceMapId;
    expect(resolveSourcePoint(b.mapped.sources,{routine:'F',sourceMapId}).text).toBe('<PRINTI "same">');
    expect(first(a.mapped,'primitive').nodeId).not.toBe(first(b.mapped,'primitive').nodeId);
  });
  it('uses lexical binding identity rather than local slot numbers',()=>{
    const a=compile('<ROUTINE F (X) <+ .X 1>>'),b=compile('<ROUTINE F (Y X) <+ .X 1>>');
    expect(first(a.mapped,'primitive').sourceMapId).toBe(first(b.mapped,'primitive').sourceMapId);
    const shadow=compile('<ROUTINE F (X) <PROG ((X 3)) <+ .X 1>>>');
    expect(first(shadow.mapped,'primitive').sourceMapId).not.toBe(first(a.mapped,'primitive').sourceMapId);
  });
  it('rejects deleted/changed semantic points and wrong-routine targets without a fallback',()=>{
    const a=compile('<ROUTINE F () <PRINTI "one">>'),b=compile('<ROUTINE F () <PRINTI "two">>'),sourceMapId=first(a.mapped,'output').sourceMapId;
    expect(()=>resolveSourcePoint(b.mapped.sources,{routine:'F',sourceMapId})).toThrow('Missing');
    expect(()=>resolveSourcePoint(a.mapped.sources,{routine:'OTHER',sourceMapId})).toThrow('Missing');
  });
  it('fails closed when repeated identical forms become ambiguous',()=>{
    const a=compile('<ROUTINE F () <CRLF>>'),b=compile('<ROUTINE F () <CRLF> <CRLF>>'),sourceMapId=first(a.mapped,'output').sourceMapId;
    expect(ids(b.mapped)).toContain(sourceMapId);expect(b.mapped.sources.entries.find(e=>e.id===sourceMapId)!.points).toHaveLength(2);
    expect(()=>resolveSourcePoint(b.mapped.sources,{routine:'F',sourceMapId})).toThrow('Ambiguous');
    const points=b.mapped.sources.entries.find(e=>e.id===sourceMapId)!.points;
    const aNode=lookupSourceNode(b.mapped.sources,{routine:'F',nodeId:points[0]!.nodeId}),bNode=lookupSourceNode(b.mapped.sources,{routine:'F',nodeId:points[1]!.nodeId});
    expect(aNode.source.start.offset).not.toBe(bNode.source.start.offset);
    expect(()=>lookupSourceNode(b.mapped.sources,{routine:'F',nodeId:'missing'})).toThrow('Missing');
  });
  it('disambiguates with a unique semantic ancestor rather than an occurrence or line number',()=>{
    const {mapped}=compile('<ROUTINE F (X) <COND (.X <CRLF>)> <COND (<NOT .X> <CRLF>)>>'),sourceMapId=first(mapped,'output').sourceMapId;
    const conditions=[...mappedSites(mapped.referenceRoutines[0]!)].filter(s=>s.value.op==='cond');
    const a=resolveSourcePoint(mapped.sources,{routine:'F',sourceMapId,within:conditions[0]!.value.sourceMapId as string});
    const b=resolveSourcePoint(mapped.sources,{routine:'F',sourceMapId,within:conditions[1]!.value.sourceMapId as string});
    expect(a.point.nodeId).not.toBe(b.point.nodeId);expect(a.source.start.offset).not.toBe(b.source.start.offset);
    expect(()=>resolveSourcePoint(mapped.sources,{routine:'F',sourceMapId,within:'missing'})).toThrow('enclosing');
  });
  it('distinguishes multiple instructions generated by one macro call and retains call/definition origins',()=>{
    const {mapped}=compile('<ROUTINE F () <TELL "a" CR "b" CR>>');
    const outputs=[...mappedSites(mapped.referenceRoutines[0]!)].filter(s=>s.value.op==='output');
    expect(new Set(outputs.map(s=>s.value.sourceMapId)).size).toBe(4);
    for(const s of outputs){const resolved=resolveSourcePoint(mapped.sources,{routine:'F',sourceMapId:s.value.sourceMapId as string});expect(resolved.point.origin?.[0]!.macro).toBe('TELL');expect(resolved.text).toBe('<TELL "a" CR "b" CR>');}
    const actual=result.sources.entries.find(e=>e.points.some(p=>p.origin?.[0]?.definition))!,origin=actual.points.find(p=>p.origin?.[0]?.definition)!.origin![0]!;
    expect(sourceLocationSpan(result.sources.locations.find(l=>l.id===origin.definition)! ).file).toBe('gmacros.zil');
  });
  it('preserves UTF-16 offsets, CRLF line positions and exact original source text',()=>{
    const source='<ROUTINE F ()\r\n\t<PRINTI "é🙂">>\r\n',c=compile(source),sourceMapId=first(c.mapped,'output').sourceMapId;
    const point=resolveSourcePoint(c.mapped.sources,{routine:'F',sourceMapId});
    expect(point.text).toBe('<PRINTI "é🙂">');expect(point.source.start).toEqual({offset:source.indexOf('<PRINTI'),line:2,column:2});
    expect(point.source.end.offset).toBe(source.lastIndexOf('>'));expect(point.source.end.column-point.source.start.column).toBe(point.text.length);
  });
  it('marks normalization provenance and generated defaults without inventing source arguments',()=>{
    expect(result.sources.normalizations.map(n=>n.rule).sort()).toEqual(['SRC-006','SRC-011']);
    expect(result.sources.entries.some(e=>e.points.some(p=>p.normalizations?.includes('SRC-006')))).toBe(true);
    const generated=result.sources.entries.find(e=>e.points.some(p=>p.generated?.startsWith('SRC-010')))!,point=generated.points.find(p=>p.generated?.startsWith('SRC-010'))!;
    const span=sourceLocationSpan(result.sources.locations.find(l=>l.id===point.location)!),text=result.sources.files.find(f=>f.file===span.file)!.text.slice(span.start.offset,span.end.offset);
    expect(text).toBe('<REST .SYN>');
  });
  it('keeps excluded parser/consumer/READ/stream sites explicit and blocks overlays in removed code',()=>{
    expect(result.report.untranslated).toEqual([]);expect(result.report.replacements).toHaveLength(25);expect(result.report.parserConsumers).toHaveLength(32);expect(result.report.reads).toHaveLength(3);expect(result.report.unsupportedHost).toHaveLength(3);
    expect(result.report.parserConsumers.every(c=>c.points.length>0&&c.plan.length>0)).toBe(true);
    const parser=result.referenceRoutines.find(r=>r.name==='PARSER')!;
    expect(result.program.routines.some(r=>r.id===parser.id)).toBe(false);
    expect(()=>resolveSourcePoint(result.sources,{routine:'PARSER',sourceMapId:parser.sourceMapId})).toThrow('replaced parser');
  });
  it('rejects missing files, invalid spans and hidden untranslated nodes',()=>{
    const c=compile('<ROUTINE F () <CRLF>>');
    expect(()=>mapLogicSources(c.logic,new Map())).toThrow('missing source span');
    const mutate=(change:(l:LinkedLogic)=>void)=>{const l=structuredClone(c.logic);change(l);return ()=>mapLogicSources(l,c.files);};
    expect(mutate(l=>{l.routines[0]!.source.start.column=2;})).toThrow('source span');
    expect(mutate(l=>{l.routines[0]!.body[0]!.expression.source.end.offset=999;})).toThrow('source span');
    expect(mutate(l=>{l.routines[0]!.body[0]!.expression={op:'untranslated',construct:'UNKNOWN',phase:'2.7',sourceText:'<UNKNOWN>',args:[],source:l.routines[0]!.source};})).toThrow('Deferred UNKNOWN');
  });
  it('detects coverage, origin, policy, report and runtime-projection corruption',()=>{
    const c=compile('<ROUTINE F () <TELL "test" CR>>');
    const corrupt=(change:(r:SourceMapResult)=>void,error:string)=>{const r=structuredClone(c.mapped);change(r);expect(()=>validateMappedSources(r,c.logic)).toThrow(error);};
    corrupt(r=>{r.sources.entries.pop();},'instruction point');
    corrupt(r=>{r.sources.entries[0]!.points.push({...r.sources.entries[0]!.points[0]!});},'instruction point');
    corrupt(r=>{r.referenceRoutines[0]!.body[0]!.expression.sourceMapId='missing';},'instruction point');
    corrupt(r=>{r.referenceRoutines[0]!.body=[];},'changed reference logic');
    corrupt(r=>{r.sources.entries.find(e=>e.points.some(p=>p.origin))!.points.find(p=>p.origin)!.origin![0]!.call=999999;},'macro origin');
    corrupt(r=>{r.program.routines=[];},'runtime projection');
    corrupt(r=>{r.sources.entries[0]!.points[0]!.policy='adapter';},'policy mismatch');
    const game=structuredClone(result);game.report.parserConsumers.pop();expect(()=>validateMappedSources(game,built.logic)).toThrow('incomplete consumer');
  });
  it('keeps relocated dictionary addresses out of semantic identity',()=>{
    const c=compile('<ROUTINE F () 0>'),one=structuredClone(c.logic),two=structuredClone(c.logic);
    one.routines[0]!.body[0]!.expression={op:'address',name:'W?TEST',value:1234,addend:7,allocation:'dictionary',source:one.routines[0]!.body[0]!.expression.source};
    two.routines[0]!.body[0]!.expression={...one.routines[0]!.body[0]!.expression,value:5678,addend:99} as LogicExpression;
    expect(ids(mapLogicSources(one,c.files))).toEqual(ids(mapLogicSources(two,c.files)));
  });
});

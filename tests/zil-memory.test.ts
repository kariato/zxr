import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, assertFullyLoweredLogic, compileMemory, compileVocabulary, compileWorldMetadata, encodeZText, expandMacros, head, linkMemoryLogic, loadProgram, logicExpressions, translateLogic, validateMemoryImage } from '../src/zil/index.ts';
import type { MemoryImage, Sequence, SymbolLayout } from '../src/zil/index.ts';
import { auditMemory, buildMemory } from '../tools/zil/memory.ts';
import { sourceFiles } from '../tools/zil/program.ts';
import { worldSymbolAnalysis } from '../tools/zil/world.ts';
import { normalizeReferenceProgram } from '../tools/zil/reference-program.ts';
const built=buildMemory(),image=built.memory;
const word=(m:MemoryImage,a:number)=>m.bytes[a]!*256+m.bytes[a+1]!;
const table=(name:string)=>image.tables.find(t=>t.owner===name)!;
function fixture(source:string){
  const p=loadProgram(new Map([['zork2.zil',source+' <ROUTINE V-TEST () <RTRUE>> <SYNTAX TEST = V-TEST>']])),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const declarations=(k:string[])=>p.forms.filter(n=>k.includes(head(n) ?? '')).map(n=>((n as Sequence).items[1] as {value:string}).value);
  const layout:SymbolLayout={objects:declarations(['OBJECT','ROOM']),globals:declarations(['GLOBAL']),routines:declarations(['ROUTINE']),words:[{name:'TEST'}],constants:{'ACT?TEST':255,'V?TEST':0}};
  const forms=expanded.forms,analysis=analyzeSymbols(p,forms,layout),operations=translateLogic(forms,analysis),world=compileWorldMetadata(forms,analysis),vocabulary=compileVocabulary(forms,analysis);
  const memory=compileMemory(forms,analysis,world,vocabulary,operations.strings);
  return {memory,operations,logic:linkMemoryLogic(operations,memory)};
}

describe('source-built memory image and linked IR',()=>{
  it('independently audits the complete initial data image and every linked routine',()=>{
    const audit=auditMemory(image,built.logic);
    expect(audit.checked).toEqual({bytes:19882,segments:697,staticBase:11682,globals:168,tables:45,tableCells:1523,objects:251,shortNames:251,exactShortNameEncodings:142,properties:1015,dictionaryEntries:689,relocations:1488,routines:439,expressions:19090,deferred:0});
    expect(audit).toEqual(JSON.parse(readFileSync('reference/memory-audit.json','utf8')));
    expect(image).toEqual(JSON.parse(readFileSync('games/zork2/memory.zxr.json','utf8')));
    expect(buildMemory()).toEqual(built);expect(()=>assertFullyLoweredLogic(built.logic)).not.toThrow();
    expect(built.logic.routines.every(r=>r.fullyLowered)).toBe(true);
    expect(built.logic.routines.filter(r=>r.source.file==='gclock.zil').length).toBeGreaterThan(0);
  });
  it('preserves word-count NONE allocations and byte-patterned parser buffers',()=>{
    expect(table('C-TABLE').length).toBe(360);expect(table('P-PRSO').length).toBe(100);expect(table('P-OCLAUSE').length).toBe(200);
    expect(table('P-LEXV').length).toBe(238);expect(image.bytes.slice(table('P-LEXV').base,table('P-LEXV').base+2)).toEqual([59,0]);
    expect(table('P-INBUF').length).toBe(121);expect(image.bytes[table('P-INBUF').base]).toBe(120);
    const clock=image.segments.find(s=>s.name==='table:C-TABLE')!;
    expect(clock.fields.filter(f=>f.domain==='routine').map(f=>f.offset)).toEqual(Array.from({length:30},(_,i)=>i*6+4));
    expect(image.bytes.slice(clock.base,clock.base+clock.length).every(b=>b===0)).toBe(true);
    expect(image.segments.find(s=>s.name==='table:P-OVTBL')!.fields.map(f=>f.width)).toEqual([2,1,1]);
  });
  it('encodes mixed and nested tables, length prefixes, aliases, and pooled empty strings',()=>{
    const {memory:m,operations,logic}=fixture('<GLOBAL A <TABLE #BYTE 18 #BYTE 52 #WORD 4660 <TABLE 7>>> <GLOBAL B <REST ,A 2>> <GLOBAL C <BACK ,B 1>> <GLOBAL D <LTABLE 9 10>> <GLOBAL E <TABLE (PURE) "" "same" "same">> <ROUTINE F () <TABLE 99>>');
    const a=m.tables.find(t=>t.owner==='A')!,nested=m.tables.find(t=>t.name==='table:A#1')!,d=m.tables.find(t=>t.owner==='D')!,e=m.tables.find(t=>t.owner==='E')!;
    expect(m.bytes.slice(a.base,a.base+4)).toEqual([18,52,18,52]);expect(word(m,a.base+4)).toBe(nested.base);expect(word(m,nested.base)).toBe(7);
    expect(m.globals.find(g=>g.name==='B')!.initial).toBe(a.base+2);expect(m.globals.find(g=>g.name==='C')!.initial).toBe(a.base+1);
    expect([word(m,d.base),word(m,d.base+2),word(m,d.base+4)]).toEqual([2,9,10]);
    expect(word(m,e.base)).toBeGreaterThan(0);expect(operations.strings.entries[word(m,e.base)-1]!.text).toBe('');expect(word(m,e.base+2)).toBe(word(m,e.base+4));
    expect(m.segments.find(s=>s.name===e.name)!.mutable).toBe(false);
    expect([...logicExpressions(logic.routines.find(r=>r.name==='F')!)][0]).toMatchObject({op:'address',allocation:'table:F',tableConstructor:'TABLE'});
    expect(operations.untranslated.some(e=>e.construct==='TABLE')).toBe(true);
  });
  it('lowers all six memory primitives in operand order and defaults REST to one byte',()=>{
    const {logic,operations}=fixture('<ROUTINE F (X) <GET .X 2> <PUT .X 2 3> <GETB .X 4> <PUTB .X 4 5> <REST .X> <BACK .X 6> ,W?TEST>');
    const expressions=[...logicExpressions(logic.routines.find(r=>r.name==='F')!)],memory=expressions.filter(e=>e.op==='memory');
    expect(memory.map(e=>e.operator)).toEqual(['GET','PUT','GETB','PUTB','REST','BACK']);
    expect(memory.map(e=>e.args.slice(1).map(a=>a.op==='literal'?a.value:null))).toEqual([[2],[2,3],[4],[4,5],[1],[6]]);
    expect(expressions.find(e=>e.op==='address')).toMatchObject({name:'W?TEST',allocation:'dictionary'});
    expect(operations.untranslated).toHaveLength(7);expect(operations.stage).toBe('operations');
  });
  it('rejects invalid memory primitive arities with source-located errors',()=>{
    for(const code of ['<GET 1>','<PUT 1 2>','<GETB 1>','<PUTB 1 2>','<REST>','<REST 1 2 3>','<BACK 1>'])expect(()=>fixture('<ROUTINE F () '+code+'>'),code).toThrow(/expects .* argument/);
  });
  it('rejects unsupported table layouts, overflow, initializer cycles and escaping aliases',()=>{
    for(const [source,error] of [['<GLOBAL A <TABLE (BYTE) 1>>','Unsupported TABLE'],['<GLOBAL A <TABLE #BYTE 256>>','exceeds 1-byte'],['<GLOBAL A <ITABLE NONE 32767>>','16-bit address'],['<GLOBAL A ,B> <GLOBAL B ,A>','cycle'],['<GLOBAL A <TABLE 1>> <GLOBAL B <BACK ,A 1>>','escapes allocation'],['<GLOBAL A <ITABLE 2 (WORD) 0>>','Unsupported ITABLE'],['<GLOBAL A <TABLE>>','Empty table']])expect(()=>fixture(source!),source).toThrow(error!);
  });
  it('retains pseudo-object short-name storage and pre-startup initial values',()=>{
    const pseudo=image.objects.find(o=>o.name==='PSEUDO-OBJECT')!,action=pseudo.properties.find(p=>p.name==='ACTION')!;
    expect(image.bytes[pseudo.propertyTable]).toBe(2);expect(action.address-5).toBe(pseudo.propertyTable+1);
    expect(image.globals.find(g=>g.name==='MOVES')!.initial).toBe(0);
    expect(image.segments.find(s=>s.name==='objects')!.fields.find(f=>f.name==='default:5')).toBeDefined();
    expect(image.relocations.some(r=>r.domain==='string')).toBe(true);expect(image.relocations.some(r=>r.domain==='routine')).toBe(true);
  });
  it('packs dictionary roles independently of JSON key order',()=>{
    const {forms,analysis}=worldSymbolAnalysis(),v=structuredClone(built.vocabulary);
    for(const w of v.words)w.roles=Object.fromEntries(Object.entries(w.roles).reverse());
    expect(compileMemory(forms,analysis,built.world,v,built.strings)).toEqual(image);
  });
  it('retains original release/serial and declares data-only header fields and writable flags',()=>{
    expect(word(image,2)).toBe(63);expect(String.fromCharCode(...image.bytes.slice(18,24))).toBe('860811');
    expect(word(image,6)).toBe(0);expect(word(image,24)).toBe(0);expect(word(image,28)).toBe(0);
    expect(word(image,26)).toBe(image.bytes.length/2);expect(image.segments[0]!.writableRanges).toEqual([{offset:16,length:2}]);
    expect(image.segments.filter(s=>!s.mutable).every(s=>s.base>=image.staticBase)).toBe(true);
  });
  it('rejects corrupted bytes, allocation coverage, pointers, globals and object trees',()=>{
    const corrupt=(change:(m:MemoryImage)=>void,error:string)=>{const m=structuredClone(image);change(m);expect(()=>validateMemoryImage(m)).toThrow(error);};
    corrupt(m=>{m.bytes[0]=256;},'invalid image');corrupt(m=>{m.segments[1]!.base++;},'allocation');
    corrupt(m=>{m.segments[1]!.fields.pop();},'incomplete fields');corrupt(m=>{m.relocations.pop();},'relocation coverage');
    corrupt(m=>{m.bytes[8]=0;},'pointer relocation');corrupt(m=>{m.globals[0]!.initial++;},'global initializer');
    corrupt(m=>{const o=m.objects[0]!;m.bytes[o.address+4]=o.id;},'cycle');
    corrupt(m=>{m.bytes[m.objects[0]!.properties[0]!.address-1]=0;},'property layout');
  });
  it('guards the INDENTS compatibility exception and keeps its original source untouched',()=>{
    const indents=table('INDENTS'),a=word(image,indents.base),b=word(image,indents.base+2);
    expect(a).toBe(b);expect(built.strings.entries[a-1]!.text).toBe('  ');
    expect(built.strings.entries.some(e=>e.text==='')).toBe(true);
    const program=loadProgram(sourceFiles()),expanded=expandMacros(program.forms,program.definitions,program.globals);
    const f=expanded.forms.find(n=>head(n)==='GLOBAL'&&(n as Sequence).items[1]?.kind==='atom'&&((n as Sequence).items[1] as {value:string}).value==='INDENTS') as Sequence;
    expect(normalizeReferenceProgram([f]).normalizations).toHaveLength(1);
    const changed=structuredClone(f),t=changed.items[2] as Sequence;
    t.items[2]={...t.items[2]!,kind:'string',value:'changed'};
    expect(()=>normalizeReferenceProgram([changed])).toThrow('SRC-011');
    expect([...sourceFiles().values()].join('\n')).toMatch(/<GLOBAL INDENTS\s+<TABLE\s*\(PURE\)\s*""/);
  });
  it('encodes empty short names and fixed-width dictionary keys without abbreviations',()=>{
    expect(encodeZText('')).toEqual([]);expect(encodeZText('',true)).toHaveLength(4);
    expect(encodeZText('abcdefg',true)).toEqual(encodeZText('abcdef',true));expect(encodeZText('abc')).toEqual([152,232]);
    expect(()=>encodeZText('💥')).toThrow('Unsupported V3 text');
  });
});

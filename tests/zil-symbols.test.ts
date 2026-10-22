import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, loadProgram, expandMacros, head, RUNTIME_OPERATIONS } from '../src/zil/index.ts';
import type { SymbolLayout } from '../src/zil/index.ts';
import { sourceFiles } from '../tools/zil/program.ts';
import { referenceSymbolLayout, symbolManifest, dictionaryBytes } from '../tools/zil/symbols.ts';
import { normalizeReferenceProgram } from '../tools/zil/reference-program.ts';
import { primitiveGroups } from '../tools/zil/semantics-contract.ts';

function analyze(source:string,layout:Partial<SymbolLayout>={}) {
  const p=loadProgram(new Map([['zork2.zil',source]])),expanded=expandMacros(p.forms,p.definitions,p.globals);
  return analyzeSymbols(p,expanded.forms,{objects:[],globals:[],routines:['F'],words:[],constants:{},...layout});
}
const messages=(source:string,layout?:Partial<SymbolLayout>)=>analyze(source,layout).diagnostics.map(d=>d.message).join('\n');

describe('reference-assisted ZIL symbol resolution',()=>{
  it('resolves the complete game with fixed observable numbering and a reproducible manifest',()=>{
    const m=symbolManifest();expect(m.diagnostics).toEqual([]);
    expect(m.counts).toMatchObject({routine:439,room:86,object:165,global:168,word:689,attribute:32,property:30,references:11901});
    expect(m).toEqual(JSON.parse(readFileSync('reference/symbol-table.json','utf8')));
    const symbol=(name:string)=>m.symbols.find(s=>s.name===name)!;
    expect(symbol('LAMP')).toMatchObject({kind:'object',number:149});
    expect(symbol('ADVENTURER')).toMatchObject({kind:'object',number:40});
    expect(symbol('V?TAKE')).toMatchObject({kind:'action',number:96});
    expect(symbol('ACT?TAKE')).toMatchObject({kind:'lexical-verb',number:236});
    expect(symbol('V?VERBOSE').number).toBe(0);
    expect(symbol('P?NORTH').number).toBe(31);
    expect(symbol('W?TAKE')).toMatchObject({kind:'word',number:null});
    expect(symbol('W?TAKE').dictionaryIndex).toBeGreaterThan(0);
    expect(symbol('W?TAKE').referenceAddress).toBeGreaterThan(0);
    const layout=referenceSymbolLayout();expect(symbol('PLAYER').number).toBe(16+layout.globals.indexOf('PLAYER'));
    expect(symbol('GO').number).toBe(1+layout.routines.indexOf('GO'));
  });
  it('packs all reference dictionary labels against their actual binary entries',()=>{
    expect(referenceSymbolLayout().words).toHaveLength(689);
    expect(dictionaryBytes('a')).toEqual([24,165,148,165]);
    expect(dictionaryBytes('abcdef')).toEqual(dictionaryBytes('abcdefgh'));
    expect(dictionaryBytes('"')).not.toEqual(dictionaryBytes(','));
    expect(()=>dictionaryBytes('λ')).toThrow('Non-ASCII');
    expect([...RUNTIME_OPERATIONS].sort()).toEqual(primitiveGroups.flatMap(g=>[...g.operations]).sort());
  });
  it('distinguishes local loads, local numbers, global loads, global numbers and routine references',()=>{
    const a=analyze('<GLOBAL G 0> <ROUTINE F (G) <SET G 2> <SETG G .G> G ,G <IGRTR? G 3> <APPLY F>>',{globals:['G']});
    expect(a.diagnostics).toEqual([]);
    expect(a.references.filter(r=>r.name==='G').map(r=>[r.kind,r.mode])).toEqual([
      ['local','write'],['global','write'],['local','local-value'],['local','variable-number'],['global','global-value'],['local','variable-number'],
    ]);
    expect(a.references.find(r=>r.name==='F')).toMatchObject({kind:'routine',mode:'value'});
  });
  it('honors default initializer order and lexical block shadowing without leaking locals',()=>{
    const a=analyze('<ROUTINE F (A "OPTIONAL" (B .A) "AUX" (C .B)) <PROG ((A .C)) .A> .A>');
    expect(a.diagnostics).toEqual([]);expect(a.routines[0]).toMatchObject({required:1,optional:1});
    expect(a.routines[0]!.locals.map(l=>[l.name,l.kind,l.slot])).toEqual([['A','required',1],['B','optional',2],['C','aux',3],['A','block',4]]);
    expect(a.references.filter(r=>r.name==='A'&&r.mode==='local-value').map(r=>r.slot)).toEqual([1,4,1]);
    expect(messages('<ROUTINE F () <PROG ((X 1)) .X> .X>')).toContain('Undefined symbol X');
    expect(messages('<ROUTINE F ("AUX" (A .B) (B 1)) .A>')).toContain('Undefined symbol B');
  });
  it('rejects duplicate declarations and local bindings with source positions',()=>{
    expect(messages('<OBJECT X> <GLOBAL X 0> <ROUTINE F ()>',{objects:['X'],globals:['X']})).toContain('Duplicate symbol X');
    const a=analyze('<ROUTINE F (X X) .X>');expect(a.diagnostics[0]).toMatchObject({code:'ZIL005',routine:'F',span:{file:'zork2.zil',start:{line:1,column:15}}});
    expect(messages('<ROUTINE F ("AUX" "OPTIONAL" X)>')).toContain('Invalid or repeated argument section');
    expect(messages('<PROPDEF SIZE 5> <PROPDEF SIZE 4> <ROUTINE F ()>',{constants:{'P?SIZE':14}})).toContain('Duplicate property default SIZE');
  });
  it('does not let the reference layout conceal deleted declarations or invalid writes/calls',()=>{
    expect(messages('<ROUTINE F () ,MISSING>',{globals:['MISSING']})).toContain('Undefined symbol MISSING');
    expect(messages('<ROUTINE F () ,MISSING>',{globals:['MISSING']})).toContain('Reference layout has no matching source declaration: MISSING');
    expect(messages('<CONSTANT C 1> <ROUTINE F () <SETG C 2>>')).toContain('Expected global C, found constant');
    expect(messages('<GLOBAL G 0> <ROUTINE F () <G>>',{globals:['G']})).toContain('Expected routine G, found global');
    expect(messages('<GLOBAL G 0> <ROUTINE F () .G>',{globals:['G']})).toContain('Undefined local G');
    expect(messages('<ROUTINE F () <NOT-AN-OP>>')).toContain('Undefined symbol NOT-AN-OP');
  });
  it('resolves forward constants, detects cycles and checks source constants against reference values',()=>{
    const a=analyze('<CONSTANT A <+ ,B 1>> <CONSTANT B 32767> <ROUTINE F () ,A>');
    expect(a.diagnostics).toEqual([]);expect(a.symbols.find(s=>s.name==='A')?.number).toBe(32768);
    expect(analyze('<CONSTANT A <* 65535 65535 65535 65535>> <ROUTINE F ()>').symbols.find(s=>s.name==='A')?.number).toBe(1);
    expect(messages('<CONSTANT A B> <CONSTANT B A> <ROUTINE F ()>')).toContain('Constant cycle');
    expect(messages('<CONSTANT A </ 1 0>> <ROUTINE F ()>')).toContain('Division by zero');
    expect(messages('<CONSTANT A 4> <ROUTINE F ()>',{constants:{A:5}})).toContain('Reference constant mismatch');
    expect(()=>analyze('<CONSTANT A> <ROUTINE F ()>')).toThrow('Missing compile-time argument');
    expect(messages('<ROUTINE F ()>',{routines:['F','F']})).toContain('Duplicate routines in reference layout');
  });
  it('checks flags, object properties, syntax targets and typed table references',()=>{
    const source='<GLOBAL G <TABLE #BYTE MISSING>> <OBJECT O (FLAGS UNKNOWN) (ACTION BAD) (IN MISSING)> <SYNTAX TEST OBJECT (FIND BADFLAG) = BAD> <ROUTINE F ()>';
    const text=messages(source,{globals:['G'],objects:['O'],words:[{name:'TEST'}],constants:{'P?ACTION':15}});
    for(const name of ['MISSING','UNKNOWN','BAD','BADFLAG'])expect(text).toContain('Undefined symbol '+name);
    expect(messages('<OBJECT O (IN O) (IN TO O)> <ROUTINE F ()>',{objects:['O'],constants:{'P?IN':21,'LOW-DIRECTION':18}})).not.toContain('Duplicate object property');
    expect(messages('<ROUTINE F () #DECL ((X) UNKNOWN-TYPE) <>>')).toBe('');
  });
  it('records guarded normalizations and rejects changed source before applying it',()=>{
    const p=loadProgram(sourceFiles()),e=expandMacros(p.forms,p.definitions,p.globals);
    expect(analyzeSymbols(p,e.forms,referenceSymbolLayout()).diagnostics.map(d=>d.message)).toContain('Unexpected list in expression');
    const n=normalizeReferenceProgram(e.forms);expect(n.normalizations).toHaveLength(2);
    const routine=n.forms.find(f=>head(f)==='ROUTINE'&&'items' in f&&f.items[1]?.kind==='atom'&&f.items[1].value==='DREARY-ROOM-FCN');
    expect(routine&&'items' in routine?head(routine.items.at(-1)!):undefined).toBe('PROG');
    const files=sourceFiles();files.set('2actions.zil',files.get('2actions.zil')!.replace('(T <PCHECK> <RFALSE>)>','(T <OTHER> <RFALSE>)>'));
    const changed=loadProgram(files);expect(()=>normalizeReferenceProgram(expandMacros(changed.forms,changed.definitions,changed.globals).forms)).toThrow('requires the audited DREARY-ROOM-FCN source');
  });
});

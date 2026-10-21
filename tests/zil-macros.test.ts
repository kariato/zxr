import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { read,expandMacros,loadProgram,print,shape,walk,head,MACROS,ZilError } from '../src/zil/index.ts';
import { sourceFiles } from '../tools/zil/program.ts';
const golden=JSON.parse(readFileSync('tests/fixtures/zil/macros.json','utf8')) as {macro:string;input:string;expected:string}[];
describe('ported Zork II macros',()=>{
  it.each(golden)('$macro expands $input',({input,expected})=>{
    expect(expandMacros(read(input,'macro.zil').nodes).forms.map(shape)).toEqual(read(expected).nodes.map(shape));
  });
  it('retains semantic verb order and both call/definition source maps',()=>{
    const p=loadProgram(sourceFiles()),call=read('\n<VERB? OPEN TAKE>','call.zil').nodes;
    const root=expandMacros(call,p.definitions,p.globals).forms[0]!;
    expect(root.semantic).toMatchObject({kind:'verb-test',values:[{value:'OPEN'},{value:'TAKE'}]});
    expect(root.origin![0]).toMatchObject({macro:'VERB?',call:{file:'call.zil',start:{line:2,column:1}},definition:{file:'gmacros.zil',start:{line:55}}});
    expect(print(root)).toBe('<EQUAL? ,PRSA ,V?TAKE ,V?OPEN>');
  });
  it.each(['<VERB?>','<TELL N>','<TELL 12>','<PROB 1 2 3>','<RFATAL 1>','<MULTIBITS FSET .O BAD>'])('diagnoses invalid macro input: %s',input=>expect(()=>expandMacros(read(input).nodes)).toThrow(ZilError));
  it('eliminates every active macro call in the entire loaded game',()=>{
    const p=loadProgram(sourceFiles()),expanded=expandMacros(p.forms,p.definitions,p.globals);
    expect([...walk(expanded.forms)].filter(n=>MACROS.includes(head(n) as typeof MACROS[number]))).toEqual([]);
    expect(expanded.counts['TELL']).toBe(1047);
  });
  it('inlines the debug D-APPLY helper without capturing argument names or evaluating arguments twice',()=>{
    const input=read('<D-APPLY <GET .T 1> <GET .T 2> <GET .T 3>>');
    const output=expandMacros(input.nodes).forms[0]!;
    const actual=print(output);for(let n=1;n<=3;n++)expect(actual.split(`<GET .T ${n}>`)).toHaveLength(2);
    expect(actual).toContain('ZXR!MACRO-1-STR');expect(actual).toContain('<APPLY .ZXR!MACRO-2-FCN .ZXR!MACRO-3-FOO>');
    expect([...walk([output])].some(n=>head(n)==='TELL')).toBe(false);
    expect(actual).toBe(readFileSync('tests/fixtures/zil/d-apply.zil','utf8').trim());
  });
  it('has a golden case for all 15 DEFMACs and all three DEFINE helpers',()=>{
    expect(new Set([...golden.map(g=>g.macro),'D-APPLY'])).toEqual(new Set(MACROS));
  });
  it('rejects altered or unknown macro programs rather than applying a hand port by name alone',()=>{
    const altered=loadProgram(new Map([['zork2.zil','<DEFMAC TELL ("ARGS" X) \'<QUIT>>']]));
    expect(()=>expandMacros(altered.forms,altered.definitions)).toThrow('differs from the pinned');
    const unknown=loadProgram(new Map([['zork2.zil','<DEFMAC CUSTOM () \'<RTRUE>>']]));
    expect(()=>expandMacros(unknown.forms,unknown.definitions)).toThrow('No game-specific expander');
  });
});

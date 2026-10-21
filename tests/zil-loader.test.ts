import { describe,expect,it } from 'vitest';
import { loadProgram,head,print,walk,ZilError } from '../src/zil/index.ts';
import { sourceFiles,activeManifest,auditSyntax } from '../tools/zil/program.ts';
const one=(text:string)=>new Map([['zork2.zil',text]]);

describe('Zork II program loader',()=>{
  it('follows INSERT-FILE order and selects the audited PREDGEN program',()=>{
    const p=loadProgram(sourceFiles());
    expect(p.files).toEqual(['zork2.zil','gmacros.zil','gsyntax.zil','2dungeon.zil','gglobals.zil','gclock.zil','gmain.zil','gparser.zil','gverbs.zil','2actions.zil']);
    expect(p.forms.filter(n=>head(n)==='ROUTINE')).toHaveLength(439);
    expect(p.forms.map(print).some(s=>s.startsWith('<ROUTINE PERFORM')&&s.includes('<NOT <EQUAL? ,PRSI ,IT>>'))).toBe(true);
    expect(p.definitions.has('D-APPLY')).toBe(false);
    expect(p.locals.get('REDEFINE')).toMatchObject({kind:'atom',value:'T'});
    expect(p.properties.get('SIZE')).toMatchObject({value:5});
    expect(p.directives.some(d=>d.name==='ID'&&'value' in d.value&&d.value.value===0)).toBe(true);
    expect(p.redefinitions.map(r=>r.name)).toEqual(['GLOBAL:DUMMY']);
    expect([...walk(p.forms)].some(n=>n.kind==='prefix'&&['read-time','comment'].includes(n.operator))).toBe(false);
  });
  it('distinguishes an absent binding from an assigned false value',()=>{
    const text='<COND (<GASSIGNED? PREDGEN> <GLOBAL YES 1>) (T <GLOBAL NO 2>)>';
    expect(loadProgram(one(text),{predgen:false}).forms.map(print)).toEqual(['<GLOBAL NO 2>']);
    expect(loadProgram(one(text),{defines:{PREDGEN:{kind:'form',items:[],span:{file:'<config>',start:{offset:0,line:1,column:1},end:{offset:0,line:1,column:1}}}}}).forms.map(print)).toEqual(['<GLOBAL YES 1>']);
  });
  it('resolves case-insensitive include names while retaining the actual source filename in spans',()=>{
    const p=loadProgram(new Map([['ENTRY.ZIL','<INSERT-FILE "LIB">'],['Lib.ZIL','<ROUTINE F ()>']]),{entry:'ENTRY.ZIL'});
    expect(p.files).toEqual(['ENTRY.ZIL','Lib.ZIL']);expect(p.forms[0]!.span.file).toBe('Lib.ZIL');
  });
  it('evaluates percent conditionals in nested/quoted objects and treats numeric zero as true',()=>{
    const p=loadProgram(one('<SETG ZORK-NUMBER 2> <GLOBAL X <TABLE %<COND (<==? ,ZORK-NUMBER 2> \'(A B)) (T \'(C))>>> <COND (0 <GLOBAL ZERO 0>)>'));
    expect(p.forms.map(print)).toContain('<GLOBAL X <TABLE (A B)>>');
    expect(p.globals.has('ZERO')).toBe(true);
  });
  it('selects the alternate debug program when PREDGEN is absent',()=>{
    const p=loadProgram(sourceFiles(),{predgen:false});expect(p.definitions.has('D-APPLY')).toBe(true);
    expect(p.forms.some(n=>head(n)==='ROUTINE'&&print(n).startsWith('<ROUTINE DD-APPLY'))).toBe(true);
  });
  it('runs percent read-time side effects even in object comments, without evaluating ordinary commented code',()=>{
    const p=loadProgram(one(';%<SETG X 2> ;<SETG X 3> <COND (<==? ,X 2> <GLOBAL OK 1>)>'));
    expect(p.globals.has('OK')).toBe(true);
    expect(p.globals.get('X')).toMatchObject({kind:'number',value:2});
  });
  it('applies REDEFINE to final declarations and rejects duplicate declarations otherwise',()=>{
    expect(()=>loadProgram(one('<GLOBAL X 1><GLOBAL X 2>'))).toThrow('Duplicate declaration');
    const p=loadProgram(one('<SET REDEFINE T><GLOBAL X 1><GLOBAL X 2>'));
    expect(p.forms.filter(n=>head(n)==='GLOBAL').map(print)).toEqual(['<GLOBAL X 2>']);
  });
  it.each([
    ['<INSERT-FILE "MISSING">','not found'],['<INSERT-FILE "../secret">','Unsafe'],['<INSERT-FILE "ZORK2">','cycle'],
    ['<GLOBAL X %<UNKNOWN 1>>','Unsupported compile-time'],['<GLOBAL X %,MISSING>','Unassigned'],
  ])('reports unsupported/missing source at its original span: %s',(text,message)=>{
    try{loadProgram(one(text));throw Error('expected failure');}catch(e){expect(e).toBeInstanceOf(ZilError);expect((e as ZilError).message).toContain(message);expect((e as ZilError).span.file).toBe('zork2.zil');}
  });
  it('matches all names and every syntax row against the independent assembly tables',()=>{
    const m=activeManifest();expect(m.counts).toEqual({routines:439,rooms:86,objects:165,globals:164,compilerGlobals:4,syntax:269,synonyms:75});
    expect(m.syntax).toHaveLength(269);expect(m.excluded.some(d=>d.name==='DUMMY'&&d.reason.startsWith('REDEFINE'))).toBe(true);
  });
  it('detects a corrupted object-slot rule against the assembly rather than just counting syntax entries',()=>{
    const p=loadProgram(sourceFiles());
    const target=p.forms.find(n=>head(n)==='SYNTAX'&&print(n).includes('(HELD CARRIED HAVE)'))!;
    const have=[...walk([target])].find(n=>n.kind==='atom'&&n.value==='HAVE')!;
    if(have.kind==='atom')have.value='MANY';
    expect(()=>auditSyntax(p)).toThrow('syntax');
  });
});

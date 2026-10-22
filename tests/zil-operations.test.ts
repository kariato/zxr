import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, assertFullyLoweredLogic, compileStringPool, expandMacros, head, loadProgram, logicExpressions, read, runtimeStrings, translateLogic, validateStringPool } from '../src/zil/index.ts';
import type { OperationsLogic, Sequence, StringPool, SymbolLayout } from '../src/zil/index.ts';
import { buildOperationsLogic, auditOperationsLogic } from '../tools/zil/operations.ts';
import { auditStringPool } from '../tools/zil/strings.ts';
import { worldSymbolAnalysis } from '../tools/zil/world.ts';

const logic=buildOperationsLogic();
function compile(source:string,extra:Partial<SymbolLayout>={}){
  const p=loadProgram(new Map([['zork2.zil',source]])),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const declarations=(k:string[])=>p.forms.filter(n=>k.includes(head(n) ?? '')).map(n=>((n as Sequence).items[1] as {value:string}).value);
  const layout:SymbolLayout={objects:declarations(['OBJECT','ROOM']),globals:declarations(['GLOBAL']),routines:declarations(['ROUTINE']),words:[],constants:{},...extra};
  return translateLogic(expanded.forms,analyzeSymbols(p,expanded.forms,layout));
}
const nodes=(l:OperationsLogic)=>l.routines.flatMap(r=>[...logicExpressions(r)]);
function semantic(value:unknown):unknown {
  if(Array.isArray(value))return value.map(semantic);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['source','origin'].includes(k)).map(([k,v])=>[k,semantic(v)]));return value;
}
const first=(body:string)=>compile('<ROUTINE F () '+body+'>').routines[0]!.body[0]!.expression;

describe('object, output and host operation lowering',()=>{
  it('covers every routine, operation family and literal deterministically while retaining memory deferrals',()=>{
    expect(logic.routines).toHaveLength(439);expect(logic.stage).toBe('operations');expect(logic.untranslated).toHaveLength(656);expect(logic.routines.filter(r=>r.fullyLowered)).toHaveLength(321);
    expect(nodes(logic)).toHaveLength(19089);expect(logic.strings.entries).toHaveLength(1342);expect(logic.untranslated.every(s=>s.phase==='2.7')).toBe(true);
    expect(logic).toEqual(buildOperationsLogic());expect(JSON.parse(JSON.stringify(logic))).toEqual(logic);
    const audit=auditOperationsLogic(logic);expect(audit.byFile).toMatchObject({'gverbs.zil':189,'2actions.zil':176,'gparser.zil':42});
    expect(audit).toEqual(JSON.parse(readFileSync('reference/logic-operations.json','utf8')));
    expect(logic.strings).toEqual(JSON.parse(readFileSync('games/zork2/strings.zxr.json','utf8')));
    expect(audit.strings.checked).toEqual({entries:1342,literalSites:1589,assemblyMatched:1341,byKind:{routine:1265,global:119,property:175,exit:30}});
    expect(new Set([...audit.capabilities.lowered,...audit.capabilities.deferredMemory,...audit.capabilities.explicitRuntimeErrors]).size).toBe(70);
    expect(()=>assertFullyLoweredLogic(logic)).toThrow('requires step 2.7');
  });
  it('lowers all object/tree/flag/property operations with exact operand order and no constant replacement',()=>{
    const cases:[string,number[]][]=[['LOC',[1]],['FIRST?',[1]],['NEXT?',[1]],['IN?',[1,2]],['MOVE',[1,2]],['REMOVE',[1]],['FSET',[1,0]],['FCLEAR',[1,0]],['FSET?',[1,0]],['GETP',[1,14]],['PUTP',[1,14,0]],['GETPT',[1,14]],['PTSIZE',[0]],['NEXTP',[1,0]]];
    for(const [operator,args] of cases)expect(semantic(first('<'+operator+' '+args.join(' ')+'>'))).toEqual({op:'object',operator,args:args.map(value=>({op:'literal',value}))});
    const d=compile('<ROUTINE F (X) <COND (<MOVE <SET X 1> 2> .X)> <PUTP .X 7 <SET X 3>>>');
    const objects=nodes(d).filter(n=>n.op==='object');expect(objects).toHaveLength(2);
    expect(objects[0]).toMatchObject({operator:'MOVE',args:[{op:'store',value:{value:1}},{value:2}]});
    expect(objects[1]).toMatchObject({operator:'PUTP',args:[{op:'load'},{value:7},{op:'store',value:{value:3}}]});
    expect(nodes(d).filter(n=>n.op==='store')).toHaveLength(2);
  });
  it('keeps all output modes distinct, interns PRINTI and preserves computed string operands',()=>{
    expect(semantic(first('<PRINTI "text">'))).toEqual({op:'output',operator:'PRINTI',args:[{op:'string',handle:1}]});
    for(const [operator,value] of [['PRINT',1],['PRINTB',1234],['PRINTC',13],['PRINTD',42],['PRINTN',65535]] as const)expect(semantic(first(`<${operator} ${value}>`))).toEqual({op:'output',operator,args:[{op:'literal',value}]});
    expect(semantic(first('<CRLF>'))).toEqual({op:'output',operator:'CRLF',args:[]});
    const e=compile('<ROUTINE F (X) <PRINT <GETP .X ,P?TEXT>>>',{constants:{'P?TEXT':7}}).routines[0]!.body[0]!.expression;
    expect(e).toMatchObject({op:'output',operator:'PRINT',args:[{op:'object',operator:'GETP',args:[{op:'load'},{op:'symbol',kind:'property',value:7}]}]});
    const d=compile('<ROUTINE F () <PRINTI "same"> <PRINT "same">>');expect(d.strings.entries).toEqual([{id:1,text:'same'}]);
    expect(nodes(d).filter(n=>n.op==='string').map(semantic)).toEqual([{op:'string',handle:1},{op:'string',handle:1}]);
  });
  it('preserves suspend expressions and enclosing success/failure branches without executing host effects',()=>{
    const d=compile('<GLOBAL INPUT 0> <GLOBAL LEX 0> <ROUTINE F () <COND (<SAVE> 11) (<RESTORE> 22) (ELSE 33)> <PROG () <READ ,INPUT ,LEX> <RESTART> <QUIT>>>');
    const suspends=nodes(d).filter(n=>n.op==='suspend');expect(suspends.map(s=>s.operator)).toEqual(['SAVE','RESTORE','READ','RESTART','QUIT']);
    expect(suspends.find(s=>s.operator==='READ')!.args).toMatchObject([{op:'load',variable:{scope:'global',number:16}},{op:'load',variable:{scope:'global',number:17}}]);
    const cond=nodes(d).find(n=>n.op==='cond')!;expect(cond.clauses.map(c=>semantic(c.body[0]!.expression))).toEqual([11,22,33].map(value=>({op:'literal',value})));
    expect(cond.clauses[0]!.test).toMatchObject({op:'suspend',operator:'SAVE'});expect(cond.clauses[1]!.test).toMatchObject({op:'suspend',operator:'RESTORE'});
    const audit=auditOperationsLogic(logic);expect(audit.suspensions).toHaveLength(10);
    expect(audit.suspensions.filter(s=>s.operator==='READ').map(s=>s.routine).sort()).toEqual(['FINISH','PARSER','YES?']);
  });
  it('retains random bounds, bundle verification and explicit unsupported stream errors',()=>{
    for(const bound of [0,-2,1,32767])expect(semantic(first('<RANDOM '+bound+'>'))).toEqual({op:'random',bound:{op:'literal',value:bound&65535}});
    const d=compile('<ROUTINE F (X) <RANDOM <SET X 5>>>');expect(nodes(d).filter(n=>n.op==='store')).toHaveLength(1);expect(nodes(d)[0]).toMatchObject({op:'random',bound:{op:'store'}});
    expect(semantic(first('<VERIFY>'))).toEqual({op:'verify'});
    for(const operator of ['DIRIN','DIROUT'])expect(semantic(first('<'+operator+' -4>'))).toEqual({op:'unsupported-host',operator,args:[{op:'literal',value:65532}]});
    expect(nodes(logic).filter(n=>n.op==='unsupported-host')).toHaveLength(3);expect(nodes(logic).some(n=>n.op==='untranslated'&&['DIRIN','DIROUT'].includes(n.construct))).toBe(false);
  });
  it('shares one source-ordered pool across defaults, globals, properties and exits while excluding metadata',()=>{
    const source='<GLOBAL MESSAGES <TABLE "shared" "">> <ROOM ROOM (DESC "short") (LDESC "shared") (NORTH "blocked") (SYNONYM "ROOM") (PSEUDO "FEATURE" F)> <ROUTINE F ("OPTIONAL" (Y "shared") "AUX" (Z "aux")) #DECL ((Y) "TYPE-TEXT") <PRINTI "shared"> <PRINT "one\ntwo">>';
    const d=compile(source,{words:[{name:'ROOM'},{name:'FEATURE'}],constants:{'P?LDESC':13,'P?NORTH':31,'LOW-DIRECTION':18,'P?SYNONYM':17,'P?PSEUDO':11}});
    expect(d.strings.entries).toEqual(['shared','','blocked','aux','one two'].map((text,i)=>({id:i+1,text})));
    expect(d.routines[0]!.bindings.map(b=>b.initializer)).toMatchObject([{op:'string',handle:1},{op:'string',handle:4}]);
    const reordered=compile('<ROUTINE F () <PRINTI "first">> <ROUTINE G () <PRINTI "second">>',{routines:['G','F']});
    expect(reordered.routines[0]!.name).toBe('G');expect(reordered.strings.entries).toEqual([{id:1,text:'first'},{id:2,text:'second'}]);
    expect(compile('<ROUTINE F ("AUX" X) <PRINTI "AUX">>').strings.entries).toEqual([{id:1,text:'AUX'}]);
  });
  it('deduplicates by decoded text and keeps empty strings nonzero and explicit whitespace intact',()=>{
    const d=compile('<ROUTINE F () <PRINTI "one\ntwo"> <PRINTI "one two"> <PRINTI "one|\ntwo"> <PRINTI " "> <COND ("" 1)>>');
    expect(d.strings.entries).toEqual(['one two','one\ntwo',' ',''].map((text,i)=>({id:i+1,text})));
    expect(nodes(d).filter(n=>n.op==='string').map(n=>n.handle)).toEqual([1,1,2,3,4]);
    expect(nodes(d).find(n=>n.op==='cond')).toMatchObject({clauses:[{test:{op:'string',handle:4}}]});
  });
  it('rejects wrong primitive arities and nonliteral PRINTI with source diagnostics',()=>{
    for(const expr of ['<LOC>','<FIRST? 1 2>','<NEXT?>','<IN? 1>','<MOVE 1>','<REMOVE 1 2>','<FSET 1>','<FCLEAR 1>','<FSET? 1>','<GETP 1>','<PUTP 1 2>','<GETPT 1>','<PTSIZE>','<NEXTP 1>','<PRINT>','<PRINTI 1>','<PRINTB>','<PRINTC>','<PRINTD>','<PRINTN>','<CRLF 1>','<RANDOM>','<READ 1>','<SAVE 1>','<RESTORE 1>','<RESTART 1>','<QUIT 1>','<VERIFY 1>','<DIRIN>','<DIROUT>'])expect(()=>first(expr),expr).toThrow();
    expect(()=>compile('<ROUTINE F (X) <PRINTI .X>>')).toThrow('PRINTI requires a literal string');
  });
  it('rejects corrupted pools, mismatched literal handles and new unexpected deferred operations',()=>{
    const {forms}=worldSymbolAnalysis();
    const mutate=(change:(l:OperationsLogic)=>void,expected:string)=>{const l=structuredClone(logic);change(l);expect(()=>auditOperationsLogic(l)).toThrow(expected);};
    mutate(l=>{nodes(l).find(n=>n.op==='string')!.handle=65535;},'invalid string handle');
    mutate(l=>{const n=nodes(l).find(n=>n.op==='string')!;n.handle=n.handle===1?2:1;},'handle/source coverage');
    mutate(l=>{l.strings.entries[0]!.text='wrong';},'deterministic source traversal');
    mutate(l=>{l.strings.entries[0]!.id=0;},'numbering');
    const pool=structuredClone(logic.strings);pool.entries[1]!.text=pool.entries[0]!.text;expect(()=>validateStringPool(pool)).toThrow('numbering/text');
    expect(auditStringPool(logic.strings,forms).checked.assemblyMatched).toBe(1341);
    mutate(l=>{const r=l.routines.find(r=>!r.fullyLowered)!,e=[...logicExpressions(r)].find(e=>e.op==='untranslated')!;e.phase='2.6';const report=l.untranslated.find(s=>s.routine===r.name&&s.source.start.offset===e.source.start.offset&&s.construct===e.construct)!;report.phase='2.6';},'unexpected deferred operation');
  });
  it('bounds unique string handles to the nonzero 16-bit domain',()=>{
    const f=read('<GLOBAL M <TABLE "seed">>').nodes[0] as Sequence,table=f.items[2] as Sequence,seed=table.items[1]!;
    const values=Array.from({length:65535},(_,i)=>({...seed,kind:'string' as const,value:'text-'+i}));
    table.items=[table.items[0]!,...values];const pool: StringPool=compileStringPool([f]);expect(pool.entries.at(-1)!.id).toBe(65535);validateStringPool(pool);
    table.items.push({...seed,kind:'string',value:'overflow'});expect(()=>compileStringPool([f])).toThrow('65535 nonzero handles');
  });
});

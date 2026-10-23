import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSymbols, assertFullyLoweredLogic, expandMacros, head, loadProgram, logicExpressions, translateCoreLogic } from '../src/zil/index.ts';
import type { CoreLogic, LogicExpression, Sequence, SymbolLayout } from '../src/zil/index.ts';
import { auditCoreLogic, buildCoreLogic } from '../tools/zil/logic.ts';

const logic=buildCoreLogic();
function compile(source:string,extra:Partial<SymbolLayout>={}){
  const p=loadProgram(new Map([['zork2.zil',source]])),expanded=expandMacros(p.forms,p.definitions,p.globals);
  const declarations=(k:string[])=>p.forms.filter(n=>k.includes(head(n) ?? '')).map(n=>((n as Sequence).items[1] as {value:string}).value);
  const layout:SymbolLayout={objects:declarations(['OBJECT','ROOM']),globals:declarations(['GLOBAL']),routines:declarations(['ROUTINE']),words:[],constants:{},...extra};
  return translateCoreLogic(expanded.forms,analyzeSymbols(p,expanded.forms,layout));
}
function semantic(value:unknown):unknown {
  if(Array.isArray(value))return value.map(semantic);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['source','origin'].includes(key)).map(([key,v])=>[key,semantic(v)]));
  return value;
}
const nodes=(data:CoreLogic)=>data.routines.flatMap(r=>[...logicExpressions(r)]);
const first=(source:string)=>compile('<ROUTINE F () '+source+'>').routines[0]!.body[0]!.expression;
const op=<K extends LogicExpression['op']>(data:CoreLogic,name:K)=>nodes(data).filter((n):n is Extract<LogicExpression,{op:K}>=>n.op===name);

describe('core ZIL routine lowering',()=>{
  it('lowers all 439 routines reproducibly and conserves source operations without hiding deferred work',()=>{
    expect(logic.routines).toHaveLength(439);expect(logic.routines.filter(r=>r.fullyLowered)).toHaveLength(32);expect(logic.untranslated).toHaveLength(5109);
    expect(nodes(logic)).toHaveLength(19093);expect(logic.stage).toBe('core');
    expect(logic).toEqual(buildCoreLogic());expect(JSON.parse(JSON.stringify(logic))).toEqual(logic);
    expect(auditCoreLogic(logic)).toEqual(JSON.parse(readFileSync('reference/logic-core.json','utf8')));
    expect(()=>assertFullyLoweredLogic(logic)).toThrow('requires step');
    expect(()=>assertFullyLoweredLogic(compile('<ROUTINE F () <+ 1 2>>'))).not.toThrow();
    const copy=structuredClone(logic);copy.untranslated=[];expect(()=>assertFullyLoweredLogic(copy)).toThrow('Deferred');
  });
  it('matches four hand-authored original-game routine trees',()=>{
    const expected=JSON.parse(readFileSync('tests/fixtures/logic/core-routines.json','utf8')) as {name:string}[];
    expect(logic.routines.filter(r=>expected.some(e=>e.name===r.name)).map(semantic)).toEqual(expected);
  });
  it('keeps ordered defaults, AUX initialization, lexical shadowing and supplied-zero call operands',()=>{
    const data=compile('<GLOBAL X 0> <ROUTINE F (X "OPTIONAL" (Y .X) "AUX" (Z .Y)) <PROG ((X .X) (W .X)) <SET X .W> <SETG X .Z>> .X> <ROUTINE G () <F 7 0>>');
    const f=data.routines[0]!;expect(f.bindings.map(b=>[b.kind,b.name,b.slot])).toEqual([['required','X',1],['optional','Y',2],['aux','Z',3]]);
    expect(f.bindings[1]!.initializer).toMatchObject({op:'load',variable:{scope:'local',name:'X',number:1}});
    expect(f.bindings[2]!.initializer).toMatchObject({op:'load',variable:{scope:'local',name:'Y',number:2}});
    const block=op(data,'block')[0]!;expect(block.bindings.map(b=>b.slot)).toEqual([4,5]);
    expect(block.bindings[0]!.initializer).toMatchObject({op:'load',variable:{number:1}});expect(block.bindings[1]!.initializer).toMatchObject({op:'load',variable:{number:4}});
    expect(op(data,'store').map(n=>n.variable)).toEqual([{scope:'local',name:'X',number:4},{scope:'global',name:'X',number:16}]);
    expect(f.body.at(-1)!.expression).toMatchObject({op:'load',variable:{number:1}});
    expect(op(data,'call')[0]!.args.map(semantic)).toEqual([{op:'literal',value:7},{op:'literal',value:0}]);
    expect(f.slotCount).toBe(5);
  });
  it('distinguishes local/global variable numbers, loads, VALUE and mutation targets',()=>{
    const d=compile('<GLOBAL X 0> <ROUTINE F (X) X .X ,X <VALUE X> <VALUE 16> <IGRTR? X <SET X 5>> <DLESS? X 0>>');
    expect(d.routines[0]!.body.slice(0,3).map(c=>semantic(c.expression))).toEqual([
      {op:'variable-number',variable:{scope:'local',name:'X',number:1}},
      {op:'load',variable:{scope:'local',name:'X',number:1}},
      {op:'load',variable:{scope:'global',name:'X',number:16}},
    ]);
    expect(op(d,'value')[0]!.variable).toMatchObject({op:'variable-number',variable:{number:1}});
    expect(op(d,'update-compare')[0]).toMatchObject({operator:'IGRTR?',variable:{number:1},bound:{op:'store',value:{op:'literal',value:5}}});
    expect(first('<VALUE 16>')).toMatchObject({op:'value',variable:{op:'literal',value:16}});
    const global=compile('<GLOBAL X 0> <ROUTINE F () X <IGRTR? X 1>>');expect(global.routines[0]!.body[0]!.expression).toMatchObject({op:'variable-number',variable:{scope:'global',number:16}});
  });
  it('retains nested return/restart targets and routine stack returns across blocks',()=>{
    const d=compile('<ROUTINE F () <REPEAT () <PROG () <RETURN> <AGAIN> <RTRUE> <RFALSE> <PUSH 2> <RSTACK>> <RETURN 9>> <AGAIN> <RETURN>>');
    const returns=op(d,'return');expect(returns.map(r=>r.target)).toEqual([{kind:'block',id:2},{kind:'routine'},{kind:'routine'},{kind:'block',id:1},{kind:'routine'}]);
    expect(returns[0]!.value).toMatchObject({op:'literal',value:1});expect(returns[1]!.value).toMatchObject({value:1});expect(returns[2]!.value).toMatchObject({value:0});expect(returns[3]!.value).toMatchObject({value:9});
    expect(op(d,'again').map(n=>n.target)).toEqual([{kind:'block',id:2},{kind:'routine'}]);
    expect(op(d,'return-stack')).toHaveLength(1);expect(op(d,'push')[0]!.value).toMatchObject({value:2});
    const go=logic.routines.find(r=>r.name==='GO')!;expect([...logicExpressions(go)].find(e=>e.op==='again')).toMatchObject({target:{kind:'routine'}});
    const assembly=readFileSync('reference/zork2/2dungeon.zap','utf8');expect(assembly).toContain('?FCN:\tPUTB\tP-LEXV,0,59');expect(assembly).toContain('\tCALL\tMAIN-LOOP\n\tJUMP\t?FCN');
  });
  it('preserves short-circuit value structure, once-only tests, empty clauses and empty blocks',()=>{
    const d=compile('<GLOBAL G 0> <ROUTINE F () <COND (<OR 0 7>) (<AND 3 <SETG G 4>> 8) (ELSE <PROG ()>)>>');
    const cond=op(d,'cond')[0]!;
    expect(cond.clauses[0]!.body).toEqual([]);expect(cond.clauses[0]!.test).toMatchObject({op:'or',args:[{value:0},{value:7}]});
    expect(cond.clauses[1]!.test).toMatchObject({op:'and',args:[{value:3},{op:'store'}]});expect(op(d,'store')).toHaveLength(1);
    expect(cond.clauses[2]!.test).toMatchObject({op:'literal',value:1});
    expect(op(d,'block')[0]).toMatchObject({kind:'prog',bindings:[],body:[]});
    const fallthrough=compile('<ROUTINE F () <PROG () 7 9>>');expect(op(fallthrough,'return')).toHaveLength(0);expect(op(fallthrough,'block')[0]!.body.at(-1)!.expression).toMatchObject({value:9});
  });
  it('keeps every arithmetic/comparison operator and operand order without JavaScript coercion/folding',()=>{
    const cases=[['+',1,2,3],['-',-1],['-',3,2],['*',2,3,4],['/',-7,3],['MOD',-7,3],['BAND',65535,3],['BOR',1,2],['BTST',3,1],['EQUAL?',0,1,2,3],['==?',1,1],['N==?',1,0],['L?',-1,0],['G?',2,1],['0?',0],['ZERO?',1],['1?',1],['NOT',0]] as const;
    for(const [operator,...args] of cases)expect(semantic(first('<'+operator+' '+args.join(' ')+'>'))).toEqual({op:'primitive',operator,args:args.map(n=>({op:'literal',value:n&65535}))});
    expect(semantic(first('65536'))).toEqual({op:'literal',value:0});expect(semantic(first('<>'))).toEqual({op:'literal',value:0});
    expect(first('<AND>')).toMatchObject({op:'and',args:[]});expect(first('<OR>')).toMatchObject({op:'or',args:[]});
  });
  it('keeps direct calls, recursion, indirect APPLY and the zero routine distinct',()=>{
    const d=compile('<ROUTINE F (X) <F <+ .X 1>> <APPLY F .X> <APPLY 0 <SET X 0>>>');
    expect(op(d,'call')[0]).toMatchObject({routine:{name:'F',id:1},args:[{op:'primitive',operator:'+'}]});
    expect(op(d,'apply')[0]).toMatchObject({routine:{op:'symbol',name:'F',kind:'routine',value:1},args:[{op:'load'}]});
    expect(op(d,'apply')[1]).toMatchObject({routine:{op:'literal',value:0},args:[{op:'store'}]});
    const ordered=compile('<ROUTINE F (X Y) .X> <ROUTINE G (\"AUX\" X) <F <SET X 1> <SET X 2>>>');
    expect(op(ordered,'call')[0]!.args.map(semantic)).toEqual([1,2].map(value=>({op:'store',variable:{scope:'local',name:'X',number:1},value:{op:'literal',value}})));
  });
  it('strips DECL metadata, retains macro provenance and marks later operations/words explicitly',()=>{
    const d=compile('<ROUTINE F (X) #DECL ((X) <OR ATOM FALSE>) <RFATAL> <PRINTN <+ .X 1>> <GET ,W?TEST 0>>',{words:[{name:'TEST'}]});
    expect(op(d,'block')[0]!.origin?.[0]?.macro).toBe('RFATAL');expect(op(d,'return-stack')).toHaveLength(1);
    expect(d.untranslated.map(s=>[s.construct,s.phase])).toEqual([['PRINTN','2.6'],['dictionary-address','2.7'],['GET','2.7']]);
    expect(op(d,'untranslated').find(n=>n.construct==='PRINTN')!.args[0]).toMatchObject({op:'primitive',operator:'+'});
    expect(nodes(d).every(n=>n.op!=='symbol'||n.name!=='ATOM')).toBe(true);
    const span=op(d,'primitive')[0]!.source;expect(span.file).toBe('zork2.zil');expect(span.start.column).toBeGreaterThan(1);
    expect(first('<PRINTI \"literal\">')).toMatchObject({op:'untranslated',construct:'PRINTI',phase:'2.6',args:[{op:'untranslated',construct:'string',phase:'2.6',sourceText:'\"literal\"'}]});
    expect(first('!\\A')).toMatchObject({op:'literal',value:65});expect(()=>first('!\\λ')).toThrow('ZSCII');
  });
  it('rejects bad arities, bad names, invalid targets and overflowing local numbering',()=>{
    for(const text of ['<+ 1>','<- 1 2 3>','<MOD 1>','<==? 1 2 3>','<NOT>','<SETG X>','<RTRUE 1>','<RFALSE 0>','<RETURN 1 2>','<AGAIN 1>','<RSTACK 1>','<PUSH>','<VALUE>','<APPLY>'])expect(()=>compile('<GLOBAL X 0> <ROUTINE F () '+text+'>'),text).toThrow();
    expect(()=>compile('<ROUTINE F (X) .X> <ROUTINE G () <F>>')).toThrow('expects 1');
    expect(()=>compile('<ROUTINE F () <F 1>>')).toThrow('expects 0');
    expect(()=>compile('<ROUTINE F () <SET MISSING 0>>')).toThrow('Undefined local');
    expect(()=>compile('<ROUTINE F () <UNKNOWN>>')).toThrow('Undefined symbol');
    expect(()=>compile('<ROUTINE F ('+Array.from({length:16},(_,i)=>'L'+i).join(' ')+') 1>')).toThrow('15 local');
  });
  it('detects dropped operations, missing deferred sites and false completion claims',()=>{
    const copy=structuredClone(logic);copy.routines.find(r=>r.name==='DO-WALK')!.body.pop();expect(()=>auditCoreLogic(copy)).toThrow('operation conservation');
    const report=structuredClone(logic);report.untranslated.pop();expect(()=>auditCoreLogic(report)).toThrow('deferred-site report');
    const status=structuredClone(logic);status.routines[0]!.fullyLowered=true;expect(()=>auditCoreLogic(status)).toThrow('lowered status');
  });
});

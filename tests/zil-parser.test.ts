import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { logicExpressions, parserConsumerPlan, resolveParserEntry, splitParserLibrary } from '../src/zil/index.ts';
import type { LinkedLogic, LogicExpression, LogicRoutine, ParserProgram } from '../src/zil/index.ts';
import { buildMemory } from '../tools/zil/memory.ts';
import { auditParserProgram, parserLedger } from '../tools/zil/parser.ts';
const built=buildMemory(),program=splitParserLibrary(built.logic,built.memory),p=program.partition;
const row=(name:string)=>p.routines.find(r=>r.name===name)!;
const routine=(name:string,logic:LinkedLogic=built.logic)=>logic.routines.find(r=>r.name===name)!;
const site=routine('LIT?').source;
const literal=(value:number):LogicExpression=>({op:'literal',value,source:site});
const load=(name:string,number:number,scope:'local'|'global'='local'):LogicExpression=>({op:'load',variable:{scope,name,number},source:site});
const command=(expression:LogicExpression)=>({op:'evaluate' as const,expression,source:site});
function extra(logic:LinkedLogic,name:string,id:number,parser:boolean,bindings:LogicRoutine['bindings'],body:LogicExpression[]){
  logic.routines.push({name,id,required:bindings.filter(b=>b.kind==='required').length,optional:bindings.filter(b=>b.kind==='optional').length,slotCount:bindings.length,bindings,body:body.map(command),fullyLowered:true,source:{...site,file:parser?'gparser.zil':'test.zil'}});
}

describe('parser library partition and effect boundaries',()=>{
  it('classifies all 42 routines independently of the source inventory and records reproducible evidence',()=>{
    const audit=auditParserProgram(program);
    expect(audit.checked).toEqual({sourceRoutines:439,parserRoutines:42,kept:15,replaced:26,adapters:1,runtimeRoutines:412,indirectSites:16,firstClassRoutineTargets:312,consumerSites:32,readSites:3});
    expect(audit).toEqual(JSON.parse(readFileSync('reference/parser-audit.json','utf8')));
    expect(p).toEqual(JSON.parse(readFileSync('games/zork2/parser.zxr.json','utf8')));
    expect(parserLedger(program)).toBe(readFileSync('games/zork2/parser-ledger.md','utf8'));
    expect(splitParserLibrary(built.logic,built.memory)).toEqual(program);
  });
  it('retains helper closures and IDs while excluding the parser middle from the runtime view',()=>{
    expect(p.routines.filter(r=>r.policy==='kept').map(r=>r.name)).toEqual(['WORD-PRINT','BUFFER-PRINT','GLOBAL-CHECK','DO-SL','SEARCH-LIST','OBJ-FOUND','TAKE-CHECK','ITAKE-CHECK','MANY-CHECK','ZMEMQ','ZMEMQB','LIT?','THIS-IT?','ACCESSIBLE?','META-LOC']);
    expect(row('LIT?').closure).toEqual(['DO-SL','OBJ-FOUND','SEARCH-LIST','THIS-IT?','ZMEMQ','ZMEMQB']);
    expect(row('TAKE-CHECK').closure).toContain('ITAKE');expect(row('BUFFER-PRINT').closure).toContain('GLOBAL-IN?');
    expect(row('CLAUSE').policy).toBe('replaced-middle');expect(row('PARSER').policy).toBe('adapter');
    expect(program.routines.some(r=>r.name==='PARSER'||r.name==='SNARF-OBJECTS')).toBe(false);
    for(const r of program.routines)expect(r.id).toBe(routine(r.name).id);
    expect(built.logic.routines).toHaveLength(439);
  });
  it('captures explicit globals and table-argument mutations through LIT?/DO-SL/search',()=>{
    expect(row('LIT?').effects.globalWrites).toEqual(['HERE','P-GWIMBIT','P-SLOCBITS','P-TABLE']);
    expect(row('LIT?').effects.memoryWrites).toEqual(['global:P-MERGE','global:P-TABLE']);
    expect(row('OBJ-FOUND').direct.memoryWrites).toEqual(['argument:2']);
    expect(row('DO-SL').effects.memoryWrites).toEqual(['global:P-TABLE']);
    expect(row('TAKE-CHECK').effects.globalWrites).toContain('PRSO');
    expect(row('TAKE-CHECK').effects.objectWrites).toContain('MOVE');
    expect(row('MANY-CHECK').effects.output).toBe(true);
    expect(row('PARSER').direct.memoryWrites).toContain('global:P-INBUF');
    expect(row('PARSER').direct.host).toContain('READ');
  });
  it('propagates recursive argument aliases, AUX pointers, defaults and global updates conservatively',()=>{
    const logic=structuredClone(built.logic);
    extra(logic,'TEST-HELPER',440,true,[{name:'TBL',slot:1,kind:'required',initializer:null,source:site},{name:'ALIAS',slot:2,kind:'aux',source:site,initializer:{op:'memory',operator:'REST',args:[load('TBL',1),literal(1)],source:site}}],[
      {op:'memory',operator:'PUTB',args:[load('ALIAS',2),literal(0),literal(1)],source:site},
      {op:'call',routine:{name:'TEST-HELPER',id:440},args:[load('TBL',1)],source:site},
    ]);
    extra(logic,'TEST-CALLER',441,true,[{name:'OPTION',slot:1,kind:'optional',source:site,initializer:{op:'store',variable:{name:'HERE',scope:'global',number:16},value:literal(0),source:site}}],[
      {op:'call',routine:{name:'TEST-HELPER',id:440},args:[load('P-MERGE',148,'global')],source:site},
      {op:'update-compare',operator:'IGRTR?',variable:{name:'HERE',scope:'global',number:16},bound:literal(1),source:site},
    ]);
    extra(logic,'TEST-ROOT',442,false,[],[{op:'call',routine:{name:'TEST-CALLER',id:441},args:[],source:site}]);
    const s=splitParserLibrary(logic,built.memory).partition;
    expect(s.routines.find(r=>r.name==='TEST-HELPER')!.effects.memoryWrites).toEqual(['argument:1']);
    expect(s.routines.find(r=>r.name==='TEST-CALLER')!.effects.memoryWrites).toEqual(['global:P-MERGE']);
    expect(s.routines.find(r=>r.name==='TEST-CALLER')!.direct.globalWrites).toEqual(['HERE']);
    expect(s.routines.find(r=>r.name==='TEST-HELPER')!.policy).toBe('kept');
  });
  it('retains unknown memory effects instead of treating loaded pointers as pure',()=>{
    const logic=structuredClone(built.logic),r=routine('OBJ-FOUND',logic);
    const put=[...logicExpressions(r)].find(e=>e.op==='memory'&&e.operator==='PUT')! as Extract<LogicExpression,{op:'memory'}>;
    put.args[0]={op:'memory',operator:'GET',args:[load('TBL',2),literal(0)],source:site};
    const s=splitParserLibrary(logic,built.memory);
    expect(s.partition.routines.find(r=>r.name==='LIT?')!.effects.memoryWrites).toContain('unknown');
  });
  it('lists every indirect site and conservatively checks every first-class routine reference',()=>{
    expect(new Set(p.indirect.map(s=>s.kind))).toEqual(new Set(['clock-record','property:P?ACTION','dispatch:PREACTIONS','property:P?CONTFCN','dispatch:ACTIONS','functional-exit','property:P?DESCFCN']));
    expect(p.indirect.every(s=>s.targets.length===312)).toBe(true);
    expect(p.routineValues.some(v=>v.owner.startsWith('properties:'))).toBe(true);
    expect(p.routineValues.some(v=>v.owner==='actions')).toBe(true);
    const logic=structuredClone(built.logic),value=logic.routines.flatMap(r=>[...logicExpressions(r)]).find(e=>e.op==='symbol'&&e.kind==='routine')! as Extract<LogicExpression,{op:'symbol'}>;
    value.name='CLAUSE';value.value=routine('CLAUSE').id;
    expect(()=>splitParserLibrary(logic,built.memory)).toThrow('First-class reference reaches replaced parser routine CLAUSE');
  });
  it('rejects hidden parser targets in initial memory and invalid routine IDs',()=>{
    const m=structuredClone(built.memory),s=m.segments.find(s=>s.fields.some(f=>f.domain==='routine'&&f.target!==undefined))!,f=s.fields.find(f=>f.domain==='routine'&&f.target!==undefined)!,relocation=m.relocations.find(r=>r.address===s.base+f.offset)!;
    f.target='CLAUSE';relocation.target='CLAUSE';const id=routine('CLAUSE').id;m.bytes[s.base+f.offset]=id>>>8;m.bytes[s.base+f.offset+1]=id&255;
    expect(()=>splitParserLibrary(built.logic,m)).toThrow('First-class reference reaches replaced parser routine CLAUSE');
    f.target='DO-SL';relocation.target='DO-SL';expect(()=>splitParserLibrary(built.logic,m)).toThrow('memory routine ID mismatch');
  });
  it('rejects unclassified APPLY domains, retained parser re-entry and unknown named calls',()=>{
    let logic=structuredClone(built.logic);const apply=logic.routines.flatMap(r=>[...logicExpressions(r)]).find(e=>e.op==='apply')! as Extract<LogicExpression,{op:'apply'}>;
    apply.routine=load('UNCLASSIFIED',1);expect(()=>splitParserLibrary(logic,built.memory)).toThrow('Unclassified indirect call');
    logic=structuredClone(built.logic);routine('LIT?',logic).body.push(command({op:'call',routine:{name:'PARSER',id:routine('PARSER').id},args:[],source:site}));
    expect(()=>splitParserLibrary(logic,built.memory)).toThrow('reaches replaced parser entry PARSER');
    logic=structuredClone(built.logic);const call=[...logicExpressions(routine('LIT?',logic))].find(e=>e.op==='call')! as Extract<LogicExpression,{op:'call'}>;call.routine.id=65535;
    expect(()=>splitParserLibrary(logic,built.memory)).toThrow('Invalid direct routine reference');
  });
  it('routes the adapter without renumbering and blocks replaced IDs and options-time execution',()=>{
    expect(resolveParserEntry(program,routine('PARSER').id,'action',{kind:'direct',caller:'MAIN-LOOP-1'})).toEqual({kind:'adapter'});
    expect(resolveParserEntry(program,row('LIT?').id,'action')).toMatchObject({kind:'routine',routine:{name:'LIT?',id:row('LIT?').id}});
    expect(resolveParserEntry(program,0,'action')).toBeNull();
    expect(()=>resolveParserEntry(program,p.adapterRoutineId,'action')).toThrow('direct adapter boundary');
    expect(()=>resolveParserEntry(program,p.adapterRoutineId,'action',{kind:'direct',caller:'LIT?'})).toThrow('direct adapter boundary');
    for(const id of [routine('CLAUSE').id,65535,-1,1.5])expect(()=>resolveParserEntry(program,id,'action')).toThrow('Unknown or replaced');
    for(const r of program.routines)expect(()=>resolveParserEntry(program,r.id,'options')).toThrow('cannot run during options');
    expect(()=>resolveParserEntry(program,p.adapterRoutineId,'options')).toThrow('cannot run during options');
  });
  it('classifies every continuation access and READ with explicit speech, actor or decision plans',()=>{
    expect(p.consumers).toHaveLength(32);expect(p.consumers.every(s=>s.ledger.startsWith('ADAPT-')&&s.plan.length>0)).toBe(true);
    expect(p.consumers.filter(s=>s.routine==='RIDDLE-ROOM-FCN'&&s.mode==='load')).toHaveLength(4);
    expect(p.consumers.find(s=>s.routine==='V-INCANT')!.plan).toContain('SPELL-USED');
    expect(p.consumers.find(s=>s.routine==='V-SAY')!.plan).toContain('HELLO');
    expect(p.consumers.find(s=>s.routine==='V-TELL')!.plan).toContain('two-pass');
    expect(p.reads.map(s=>[s.routine,s.policy])).toEqual([['PARSER','adapter-input'],['FINISH','pending-decision'],['YES?','pending-decision']]);
    expect(()=>parserConsumerPlan({routine:'NEW',global:'P-CONT',mode:'load'})).toThrow('Unclassified parser consumer');
  });
  it('rejects newly discovered consumer/READ sites and nonzero continuation assignments',()=>{
    for(const expression of [load('P-CONT',167,'global'),{op:'suspend',operator:'READ',args:[load('P-INBUF',16,'global'),load('P-LEXV',17,'global')],source:site} as LogicExpression,{op:'store',variable:{name:'P-CONT',scope:'global',number:167},value:literal(1),source:site} as LogicExpression]){
      const logic=structuredClone(built.logic);routine('NULL-F',logic).body.push(command(expression));expect(()=>splitParserLibrary(logic,built.memory)).toThrow(/Unclassified/);
    }
    const corrupt=structuredClone(program) as ParserProgram;corrupt.routines.pop();expect(()=>auditParserProgram(corrupt)).toThrow('executable partition');
  });
});

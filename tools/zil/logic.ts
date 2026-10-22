import { CORE_OPERATIONS, head, logicExpressions, translateCoreLogic } from '../../src/zil/index.ts';
import type { CoreLogic, OperationsLogic, LinkedLogic, LogicExpression, Sequence } from '../../src/zil/index.ts';
import { loadSymbols, sha256 } from '../reference/symbols.ts';
import { executable } from './semantics.ts';
import { sourceFiles } from './program.ts';
import { worldSymbolAnalysis } from './world.ts';

export function buildCoreLogic(){const {forms,analysis}=worldSymbolAnalysis();return translateCoreLogic(forms,analysis);}
const returnOps=new Set(['RETURN','RTRUE','RFALSE']);
function sourceOperation(e:LogicExpression):string|undefined {
  switch(e.op){
    case 'memory':case 'object':case 'output':case 'suspend':case 'unsupported-host':case 'primitive':case 'update-compare':return e.operator;
    case 'random':return 'RANDOM';case 'verify':return 'VERIFY';
    case 'store':return e.variable.scope==='local'?'SET':'SETG';
    case 'value':return 'VALUE';case 'and':return 'AND';case 'or':return 'OR';case 'cond':return 'COND';
    case 'block':return e.kind==='prog'?'PROG':'REPEAT';case 'return':return 'RETURN/RTRUE/RFALSE';
    case 'again':return 'AGAIN';case 'push':return 'PUSH';case 'return-stack':return 'RSTACK';case 'apply':return 'APPLY';
    case 'call':return e.routine.name;case 'address':return e.tableConstructor;
    case 'untranslated':return ['string','dictionary-address'].includes(e.construct)?undefined:e.construct;
  }
}
/** Structural conservation check, not execution or a proof of behavioral equivalence. */
export function auditCoreLogic(logic:CoreLogic|OperationsLogic|LinkedLogic){
  const {forms}=worldSymbolAnalysis(),symbols=loadSymbols();
  const equal=(a:unknown,b:unknown,label:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Core logic audit: ${label} differs`);};
  const operations=logic.stage!=='core',linked=logic.stage==='linked';
  equal([logic.format,logic.semantics,logic.stage],[operations?'zxr-logic-v1':'zxr-logic-core-v1','zxr-zork2-semantics-v1',linked?'linked':operations?'operations':'core'],'stage/ABI');
  equal(logic.routines.map(r=>[r.name,r.id]),symbols.routines.map((r,i)=>[r.name,i+1]),'routine names/IDs');
  const normalized=(op:string)=>returnOps.has(op)?'RETURN/RTRUE/RFALSE':op;
  const counts=(ops:string[])=>Object.fromEntries([...new Set(ops)].sort().map(op=>[op,ops.filter(o=>o===op).length]));
  const deferred:CoreLogic['untranslated']=[],details=[];let expressions=0;
  for(const routine of logic.routines){
    const source=forms.find(n=>head(n)==='ROUTINE'&&(n as Sequence).items[1]?.kind==='atom'&&((n as Sequence).items[1] as {value:string}).value===routine.name) as Sequence;
    if(!source)throw new Error('Missing routine source '+routine.name);
    const sourceOps=[...executable(source.items.slice(2))].flatMap(n=>head(n)?[normalized(head(n)!)]:[]);
    const nodes=[...logicExpressions(routine)],compiledOps=nodes.flatMap(e=>sourceOperation(e)?[sourceOperation(e)!]:[]);
    equal(counts(compiledOps),counts(sourceOps),routine.name+' operation conservation');
    const pending=nodes.filter(e=>e.op==='untranslated');
    equal(routine.fullyLowered,pending.length===0,routine.name+' lowered status');
    for(const e of pending)deferred.push({routine:routine.name,construct:e.construct,phase:e.phase,source:e.source,...(e.origin?{origin:e.origin}:{})});
    expressions+=nodes.length;
    details.push({name:routine.name,id:routine.id,required:routine.required,optional:routine.optional,slots:routine.slotCount,fullyLowered:routine.fullyLowered,expressions:nodes.length,deferred:pending.length,sha256:sha256(JSON.stringify(routine))});
  }
  const key=(s:CoreLogic['untranslated'][number])=>JSON.stringify(s);
  equal(deferred.map(key).sort(),logic.untranslated.map(key).sort(),'complete deferred-site report');
  const operationCounts=counts(deferred.map(s=>s.construct));
  return {format:linked?'zxr-logic-linked-audit-v1':operations?'zxr-logic-operations-audit-v1':'zxr-logic-core-audit-v1',stage:logic.stage,logicSha256:sha256(JSON.stringify(logic)),
    sourceHashes:[...sourceFiles()].map(([file,text])=>({file,sha256:sha256(text)})),
    counts:{routines:logic.routines.length,fullyLoweredRoutines:logic.routines.filter(r=>r.fullyLowered).length,maxLocalSlots:Math.max(...logic.routines.map(r=>r.slotCount)),expressions,deferredSites:deferred.length},
    coreOperations:CORE_OPERATIONS,untranslatedCounts:operationCounts,routines:details,
    untranslated:logic.untranslated.map(s=>({routine:s.routine,construct:s.construct,phase:s.phase,file:s.source.file,line:s.source.start.line,column:s.source.start.column})),
    limits:linked?['Linked data addresses and memory primitives; no deferred constructs remain. Runtime execution and conformance are phase 3.', 'Parser classification, source-map IDs, schema validation and bundle packing remain steps 2.8–2.10.']:operations?['Operations-stage IR; memory/dictionary addresses remain deferred to step 2.7. A fullyLowered flag covers a routine only, not its callees.', 'Structural checks and source/assembly string membership are not runtime conformance; execution, save continuations and output checks remain phase 3.']:['Partial core IR, not executable logic or a game bundle. A fullyLowered flag covers that routine only, not its callees.','Operation conservation and hand-authored trees check lowering structure; execution, numeric behavior and oracle conformance require phase 3.','Object/output/host/string operations remain step 2.6; memory operations and dictionary addresses remain step 2.7. Parser classification, source-map IDs and schemas/bundles remain steps 2.8–2.10.']};
}

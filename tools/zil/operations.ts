import { CORE_OPERATIONS, OBJECT_OPERATIONS, OUTPUT_OPERATIONS, logicExpressions, runtimeStrings, translateLogic } from '../../src/zil/index.ts';
import type { OperationsLogic } from '../../src/zil/index.ts';
import { auditCoreLogic } from './logic.ts';
import { auditStringPool } from './strings.ts';
import { verifyPrimitiveInventory } from './semantics-contract.ts';
import { worldSymbolAnalysis } from './world.ts';

export function buildOperationsLogic(){const {forms,analysis}=worldSymbolAnalysis();return translateLogic(forms,analysis);}
export function auditOperationsLogic(logic:OperationsLogic){
  if(logic.stage!=='operations'||logic.format!=='zxr-logic-v1')throw new Error('Operations audit: invalid stage/format');
  const {forms}=worldSymbolAnalysis(),structural=auditCoreLogic(logic),strings=auditStringPool(logic.strings,forms);
  const memory=['GET','PUT','GETB','PUTB','REST','BACK'],host=['READ','SAVE','RESTORE','RESTART','QUIT'],streams=['DIRIN','DIROUT'];
  const lowered=[...CORE_OPERATIONS,...Object.keys(OBJECT_OPERATIONS),...Object.keys(OUTPUT_OPERATIONS),'RANDOM',...host,'VERIFY'];
  verifyPrimitiveInventory([...lowered,...memory,...streams]);
  if(logic.untranslated.some(s=>s.phase!=='2.7'||![...memory,'dictionary-address'].includes(s.construct)))throw new Error('Operations audit: unexpected deferred operation');
  const handles=new Map(logic.strings.entries.map(e=>[e.text,e.id]));
  const location=(owner:string,source:{file:string;start:{offset:number};end:{offset:number}},handle:number)=>JSON.stringify([owner,source.file,source.start.offset,source.end.offset,handle]);
  const expected=[...runtimeStrings(forms)].filter(s=>s.kind==='routine').map(s=>location(s.owner,s.source,handles.get(s.text)!)).sort();
  const actual:string[]=[],unsupportedHost=[],suspensions=[];
  for(const r of logic.routines)for(const e of logicExpressions(r)){
    if(e.op==='string'){
      if(!Number.isInteger(e.handle)||e.handle<1||e.handle>logic.strings.entries.length)throw new Error('Operations audit: invalid string handle');
      actual.push(location(r.name,e.source,e.handle));
    }
    if(e.op==='unsupported-host')unsupportedHost.push({routine:r.name,operator:e.operator,source:e.source});
    if(e.op==='suspend')suspensions.push({routine:r.name,operator:e.operator,source:e.source});
  }
  if(JSON.stringify(actual.sort())!==JSON.stringify(expected))throw new Error('Operations audit: literal handle/source coverage differs');
  const byFile=Object.fromEntries([...new Set(logic.routines.map(r=>r.source.file))].sort().map(file=>[file,logic.routines.filter(r=>r.source.file===file).length]));
  return {...structural,strings,capabilities:{lowered,deferredMemory:memory,explicitRuntimeErrors:streams},byFile,suspensions,unsupportedHost,
    limits:[...structural.limits,'DIRIN/DIROUT lower to explicit unsupported-host errors, not working stream operations.','The shared pool includes global/table/property/exit text; memory allocation will link those uses in step 2.7. No string handle is a byte address.']};
}

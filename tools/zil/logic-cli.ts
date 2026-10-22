import { readFileSync, writeFileSync } from 'node:fs';
import { buildCoreLogic, auditCoreLogic } from './logic.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/logic-cli.ts record|check');
  const logic=buildCoreLogic(),audit=auditCoreLogic(logic),file='reference/logic-core.json',text=JSON.stringify(audit,null,2)+'\n';
  if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(`${file} differs; review the lowering before intentionally running logic:record.`);
  console.log(`Core logic: ${audit.counts.routines} routines, ${audit.counts.fullyLoweredRoutines} with no deferred constructs in their own body/defaults; ${audit.counts.expressions} expressions checked. ${audit.counts.deferredSites} sites explicitly deferred to steps 2.6/2.7. This is not executable game logic.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

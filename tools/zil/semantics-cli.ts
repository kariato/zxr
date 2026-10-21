import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { semanticsInventory } from './semantics.ts';
import { semanticsProbes } from './semantics-probes.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/semantics-cli.ts record|check');
  const inventory=semanticsInventory(),probes=semanticsProbes();
  if(!isDeepStrictEqual(probes,semanticsProbes()))throw new Error('Compatibility probes are not deterministic');
  for(const [path,data] of [['reference/semantics-inventory.json',inventory],['reference/semantics-probes.json',probes]] as const){
    const text=JSON.stringify(data,null,2)+'\n';
    if(mode==='record')writeFileSync(path,text);
    else if(readFileSync(path,'utf8')!==text)throw new Error(`${path} differs; investigate before intentionally running semantics:record.`);
  }
  console.log(`Compatibility audit: ${inventory.counts.routines} routines, ${inventory.counts.operations} operations, ${inventory.headerAccesses.length} header sites, ${probes.cases.length} binary probes (each reproduced twice). This verifies oracle evidence; runtime conformance is a later phase.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

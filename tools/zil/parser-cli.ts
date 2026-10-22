import { readFileSync, writeFileSync } from 'node:fs';
import { auditParserProgram, buildParserProgram, parserLedger } from './parser.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/parser-cli.ts record|check');
  const program=buildParserProgram(),audit=auditParserProgram(program);
  const artifacts=[['games/zork2/parser.zxr.json',JSON.stringify(program.partition,null,2)+'\n'],['reference/parser-audit.json',JSON.stringify(audit,null,2)+'\n'],['games/zork2/parser-ledger.md',parserLedger(program)]] as const;
  for(const [file,text] of artifacts)if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(`${file} differs; review before intentionally running parser:record.`);
  console.log(`Parser split: ${audit.checked.parserRoutines} classified, ${audit.checked.kept} kept, ${audit.checked.replaced} replaced, 1 adapter; ${audit.checked.indirectSites} indirect calls, ${audit.checked.consumerSites} consumer sites, ${audit.checked.readSites} READ sites verified. Execution remains phase 3.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

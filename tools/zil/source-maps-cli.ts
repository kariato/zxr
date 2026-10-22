import { readFileSync, writeFileSync } from 'node:fs';
import { auditSourceMaps, buildSourceMapProgram, serializeSourceMap } from './source-maps.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/source-maps-cli.ts record|check');
  const {result,logic}=buildSourceMapProgram(),audit=auditSourceMaps(result,logic);
  const artifacts=[['games/zork2/source-map.zxr.json',serializeSourceMap(result.sources)],['reference/translation-report.json',JSON.stringify(result.report,null,2)+'\n'],['reference/source-map-audit.json',JSON.stringify(audit,null,2)+'\n']] as const;
  for(const [file,text] of artifacts)if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(`${file} differs; review before intentionally running source-maps:record.`);
  console.log(`Source maps: ${audit.checked.sites} sites across ${audit.checked.routines} routines (${audit.checked.runtimeRoutines} runtime); ${audit.checked.stableIds} semantic IDs, ${audit.checked.untranslated} untranslated constructs. ${audit.checked.replacements} parser replacements and ${audit.checked.parserConsumers} consumers explicitly reported. Execution remains phase 3.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

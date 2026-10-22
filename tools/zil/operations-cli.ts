import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildOperationsLogic, auditOperationsLogic } from './operations.ts';
try {
  const mode=process.argv[2];if(!['check','record'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/zil/operations-cli.ts record|check');
  const logic=buildOperationsLogic(),audit=auditOperationsLogic(logic);
  const artifacts=[['games/zork2/strings.zxr.json',logic.strings],['reference/logic-operations.json',audit]] as const;
  if(mode==='record')mkdirSync('games/zork2',{recursive:true});
  for(const [file,data] of artifacts){const text=JSON.stringify(data,null,2)+'\n';if(mode==='record')writeFileSync(file,text);else if(readFileSync(file,'utf8')!==text)throw new Error(`${file} differs; review before intentionally running operations:record.`);}
  console.log(`Logic operations: ${logic.routines.length} routines (${audit.byFile['gverbs.zil']} verb-library, ${audit.byFile['2actions.zil']} game-action); ${logic.strings.entries.length} strings shared across ${audit.strings.checked.literalSites} literal sites. ${logic.untranslated.length} memory/address sites remain for step 2.7; ${audit.unsupportedHost.length} debug stream sites explicitly error. Runtime execution is not implemented.`);
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

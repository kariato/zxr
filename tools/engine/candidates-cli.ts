import { readFileSync, writeFileSync } from 'node:fs';
import { recordCandidates } from './candidates.ts';
try {
  const mode=process.argv[2];
  if(!['record','check'].includes(mode??'')||process.argv.length!==3)throw new Error('Usage: node tools/engine/candidates-cli.ts record|check');
  const data=recordCandidates(),text=JSON.stringify(data)+'\n',path='reference/candidate-audit.json';
  if(mode==='record')writeFileSync(path,text);else if(readFileSync(path,'utf8')!==text)throw new Error(path+' differs; review before recording');
  console.log(`Candidates: ${data.families.length} syntax families, ${data.objects.length} objects ${mode==='record'?'recorded':'verified'}`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

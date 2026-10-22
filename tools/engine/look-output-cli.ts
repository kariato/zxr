import { readFileSync, writeFileSync } from 'node:fs';
import { recordLookOutput } from './look-output.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '')||process.argv.length!==3)throw new Error('Usage: node tools/engine/look-output-cli.ts record|check');
  const data=recordLookOutput(),text=JSON.stringify(data,null,2)+'\n',path='reference/look-output.json';
  if(mode==='record')writeFileSync(path,text);else if(readFileSync(path,'utf8')!==text)throw new Error(path+' differs; review before recording');
  console.log('LOOK output: five original-story room recordings '+(mode==='record'?'recorded':'verified'));
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

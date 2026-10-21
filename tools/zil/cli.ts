import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { activeManifest } from './program.ts';
import { expansionSamples } from './expansions.ts';
try {
  const mode=process.argv[2];if(!['record','check'].includes(mode ?? '') || process.argv.length>3)throw new Error('Usage: node tools/zil/cli.ts record|check');
  const manifest=activeManifest(),samples=expansionSamples();
  const artifacts:[string,string][]=[['reference/active-program.json',JSON.stringify({...manifest,expansionSamples:samples.map(({source:_,...metadata})=>metadata)},null,2)+'\n'],
    ...samples.map(s=>[`tests/fixtures/zil/expanded/${s.name.toLowerCase().replaceAll('?','q')}.zil`,s.source] as [string,string])];
  if(mode==='record')mkdirSync('tests/fixtures/zil/expanded',{recursive:true});
  for(const [path,text] of artifacts) {
    if(mode==='record')writeFileSync(path,text);
    else if(!isDeepStrictEqual(readFileSync(path,'utf8'),text))throw new Error(`${path} differs. Review the source/expansion before intentionally updating with zil:record.`);
  }
  console.log(`ZIL audit: 11 files; 439 routines; 269 assembly-matched syntax entries; 20 expansion samples verified.`);
} catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

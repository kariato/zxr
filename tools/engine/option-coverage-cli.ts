import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { loadGame } from '../../src/engine/index.ts';
import { packBundle } from '../../src/zil/bundle.ts';
import { compileSourcePath } from '../zil/compile.ts';
import { authorOptionFixtures, checkOptionCoverage } from './option-coverage.ts';
import type { OptionFixtures } from './option-coverage.ts';
import type { ReplayFixtures } from './replay.ts';
try{
  const [mode,...extra]=process.argv.slice(2);if(!['record','check'].includes(mode??'')||extra.length)throw new Error('Usage: options:record | options:check');
  const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),base=JSON.parse(readFileSync('reference/structured-replay.json','utf8')) as ReplayFixtures;
  const path='reference/option-replay.json',evidence='reference/option-coverage.json';
  const fixtures:OptionFixtures=mode==='record'?authorOptionFixtures(game):JSON.parse(readFileSync(path,'utf8'));
  const result=checkOptionCoverage(game,base,fixtures,(id,n,reused)=>console.log(`${id}: ${n}/${n} offered; ${reused?'exact prefix witness verified':'shell-controller execution passed'}`),(id,n,total)=>{if(n%50===0)console.log(`${id}: checked ${n}/${total} offered inputs`);});
  if(mode==='record'){writeFileSync(path,JSON.stringify(fixtures,null,2)+'\n');writeFileSync(evidence,JSON.stringify(result,null,2)+'\n');}
  else if(!isDeepStrictEqual(result,JSON.parse(readFileSync(evidence,'utf8'))))throw new Error('Option coverage evidence differs; inspect before recording');
  console.log(`${result.offered}/${result.total} required actions offered; 0 unsupported; full-score victory verified.`);
}catch(error){console.error(error instanceof Error?error.stack:String(error));process.exitCode=1;}

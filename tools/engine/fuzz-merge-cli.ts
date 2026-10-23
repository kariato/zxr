import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { loadGame } from '../../src/engine/bundle-loader.ts';
import { mergeFuzzResults } from './fuzz-results.ts';
import type { FuzzResults } from './fuzz-results.ts';
try{
  const [directory,bundle,seed]=process.argv.slice(2);if(!directory||!bundle||!seed||!/^\d+$/.test(seed)||process.argv.length!==5)throw new Error('Usage: fuzz-merge-cli.ts results-directory game.zxb seed');
  const game=loadGame(readFileSync(bundle)),entries=readdirSync(directory);if(entries.some(file=>file.endsWith('.failure.json')))throw new Error('Campaign contains a recorded fuzz failure');const files=entries.filter(f=>/^shard-\d+\.json$/.test(f));
  const rows=files.map(file=>JSON.parse(readFileSync(directory+'/'+file,'utf8')) as FuzzResults),result=mergeFuzzResults(rows,{buildHash:game.buildHash,seed:Number(seed),start:0,games:10000,turns:300,shards:256});
  writeFileSync(directory+'/campaign.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(cause){console.error(cause instanceof Error?cause.message:String(cause));process.exitCode=1;}

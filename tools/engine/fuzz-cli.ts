import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadGame } from '../../src/engine/bundle-loader.ts';
import { packBundle } from '../../src/zil/bundle.ts';
import { compileSourcePath } from '../zil/compile.ts';
import { FuzzFailure, fuzzGame, fuzzGameIndices } from './fuzz.ts';
try{
  const args=process.argv.slice(2),values=new Map<string,string>();
  for(let i=0;i<args.length;i+=2){const key=args[i]!,value=args[i+1];if(!['--games','--turns','--seed','--start','--shard','--shards','--output','--bundle'].includes(key)||value===undefined||values.has(key))throw new Error('Usage: fuzz-cli.ts [--games N] [--turns N] [--seed uint32] [--start index] [--shard index --shards count] [--output path] [--bundle game.zxb]');values.set(key,value);}
  const number=(key:string,fallback:number)=>{const raw=values.get(key);if(raw===undefined)return fallback;if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error('Invalid '+key);return Number(raw);};
  const games=number('--games',10000),turns=number('--turns',300),seed=number('--seed',0x5a5852),start=number('--start',0),shard=number('--shard',0),shards=number('--shards',1),output=values.get('--output')??'out/fuzz/shard-'+shard+'.json';
  const indices=fuzzGameIndices(games,start,shard,shards);if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||turns<1||turns>10000)throw new Error('Invalid seed/turn budget');
  const bundle=values.get('--bundle'),game=loadGame(bundle?readFileSync(bundle):packBundle(compileSourcePath('reference/zork2'))),began=performance.now();
  mkdirSync(dirname(output),{recursive:true});rmSync(output,{force:true});rmSync(output+'.failure.json',{force:true});rmSync(output+'.partial.json',{force:true});const cases=[];
  for(const index of indices){
    try{cases.push(fuzzGame(game,{seed,game:index,turns}));}
    catch(cause){if(cause instanceof FuzzFailure){writeFileSync(output+'.failure.json',JSON.stringify(cause.record,null,2)+'\n');writeFileSync(output+'.partial.json',JSON.stringify({format:'zxr-fuzz-partial-v1',buildHash:game.buildHash,seed,start,games,turns,shard,shards,completedGames:cases.length,cases},null,2)+'\n');console.error(`Reproduce: npm run fuzz -- --seed ${seed} --start ${index} --games 1 --turns ${turns}`);}throw cause;}
    if(indices.length<=100||cases.length%10===0||cases.length===indices.length)console.log(`Fuzz shard ${shard}/${shards}: ${cases.length}/${indices.length} games, ${cases.reduce((n,c)=>n+c.inputs,0)} accepted player inputs`);
  }
  const totals={games:cases.length,inputs:0,actions:0,decisions:0,hosts:0,terminated:0,drafts:0,multiple:0,all:0,words:0,actors:0};
  for(const row of cases){for(const key of ['inputs','actions','decisions','hosts','drafts','multiple','all','words','actors'] as const)totals[key]+=row[key];totals.terminated+=Number(row.terminated);}
  writeFileSync(output,JSON.stringify({format:'zxr-fuzz-results-v1',buildHash:game.buildHash,seed,start,games,turns,shard,shards,elapsedMs:Math.round(performance.now()-began),totals,cases},null,2)+'\n');console.log(JSON.stringify(totals));
}catch(cause){console.error(cause instanceof Error?cause.message:String(cause));process.exitCode=1;}

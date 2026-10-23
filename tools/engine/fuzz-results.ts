import { fuzzGameIndices, fuzzSeeds } from './fuzz.ts';
import type { FuzzStats } from './fuzz.ts';
export interface FuzzResults {format:'zxr-fuzz-results-v1';buildHash:string;seed:number;start:number;games:number;turns:number;shard:number;shards:number;elapsedMs:number;totals:Record<string,number>;cases:FuzzStats[]}
export function mergeFuzzResults(rows:FuzzResults[],expected:{buildHash:string;seed:number;start:number;games:number;turns:number;shards:number}){
  if(!/^[0-9a-f]{64}$/.test(expected.buildHash)||!Number.isSafeInteger(expected.seed)||expected.seed<0||expected.seed>0xffffffff||!Number.isSafeInteger(expected.turns)||expected.turns<1||expected.turns>10000)throw new Error('Invalid fuzz campaign configuration');
  fuzzGameIndices(expected.games,expected.start,0,expected.shards);
  const shards=new Set<number>(),games=new Set<number>();let inputs=0,terminated=0,hosts=0;
  const fields=['inputs','actions','decisions','hosts','drafts','multiple','all','words','actors'] as const;
  for(const row of rows){
    if(row.format!=='zxr-fuzz-results-v1'||['buildHash','seed','start','games','turns','shards'].some(key=>row[key as keyof typeof row]!==expected[key as keyof typeof expected])||!Number.isSafeInteger(row.shard)||row.shard<0||row.shard>=expected.shards||shards.has(row.shard))throw new Error('Mismatched/duplicate fuzz shard');
    shards.add(row.shard);const indices=fuzzGameIndices(expected.games,expected.start,row.shard,expected.shards);
    if(!Array.isArray(row.cases)||JSON.stringify(row.cases.map(c=>c.game))!==JSON.stringify(indices))throw new Error('Missing, duplicated or reordered fuzz games');
    const totals:Record<string,number>={games:row.cases.length,terminated:0,...Object.fromEntries(fields.map(key=>[key,0]))};
    for(const c of row.cases){
      const seeds=fuzzSeeds(expected.seed,c.game);
      if(games.has(c.game)||c.gameSeed!==seeds.gameSeed||c.chooserSeed!==seeds.chooserSeed||fields.some(key=>!Number.isSafeInteger(c[key])||c[key]<0)||typeof c.terminated!=='boolean'||c.inputs<1||c.inputs>expected.turns||c.inputs!==c.actions+c.decisions||c.drafts!==c.actions||c.all+c.multiple>c.actions||c.words>c.actions||c.actors>c.actions||c.inputs<expected.turns&&!c.terminated||!/^[0-9a-f]{64}$/.test(c.stateHash))throw new Error('Invalid or incomplete fuzz game');
      games.add(c.game);for(const key of fields)totals[key]!+=c[key];totals.terminated!+=Number(c.terminated);inputs+=c.inputs;hosts+=c.hosts;terminated+=Number(c.terminated);
    }
    if(Object.keys(row.totals).length!==Object.keys(totals).length||Object.entries(totals).some(([key,value])=>row.totals[key]!==value))throw new Error('Incorrect fuzz shard totals');
  }
  if(shards.size!==expected.shards||games.size!==expected.games)throw new Error('Incomplete fuzz campaign');
  return {format:'zxr-fuzz-campaign-v1',...expected,completedGames:games.size,inputs,hosts,terminated,inputBudget:expected.games*expected.turns};
}

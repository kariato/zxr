import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { loadGame } from '../../src/engine/index.ts';
import { packBundle } from '../../src/zil/index.ts';
import { compileSourcePath } from '../zil/compile.ts';
import { checkReplayCase, replaySources } from './replay.ts';
import type { ReplayFixtures } from './replay.ts';
try {
  const [mode,id,...extra]=process.argv.slice(2);if(!['record','check'].includes(mode??'')||extra.length||mode==='record'&&id)throw new Error('Usage: replay:record | replay:check [case-id]');
  const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),path='reference/structured-replay.json',evidencePath='reference/engine-replay.json';
  const sources=replaySources().filter(s=>!id||s.id===id);if(!sources.length)throw new Error('Unknown replay case '+id);
  const fixtures:ReplayFixtures=mode==='check'?JSON.parse(readFileSync(path,'utf8')):{format:'zxr-structured-replay-v1',buildHash:game.buildHash,cases:[]};
  if(fixtures.format!=='zxr-structured-replay-v1'||fixtures.buildHash!==game.buildHash)throw new Error('Structured replay build/format mismatch');
  if(mode==='check'&&!id&&!isDeepStrictEqual(fixtures.cases.map(c=>c.id),sources.map(s=>s.id)))throw new Error('Structured replay case coverage differs');
  const evidence=[];
  for(const source of sources){
    const fixture=fixtures.cases.find(c=>c.id===source.id);if(mode==='check'&&!fixture)throw new Error('Missing authored fixture '+source.id);
    const result=checkReplayCase(game,source,fixture);if(mode==='record')fixtures.cases.push(result.fixture);evidence.push(result.evidence);
    console.log(source.id+': '+result.evidence.commands+' structured actions, '+result.evidence.gameDraws+' game draws, exact text/state/call sites passed');
  }
  const summary={format:'zxr-engine-replay-v1',buildHash:game.buildHash,cases:evidence};
  if(mode==='record'){writeFileSync(path,JSON.stringify(fixtures,null,2)+'\n');writeFileSync(evidencePath,JSON.stringify(summary,null,2)+'\n');}
  else {const recorded=JSON.parse(readFileSync(evidencePath,'utf8'));if(id)recorded.cases=recorded.cases.filter((c:{id:string})=>c.id===id);if(!isDeepStrictEqual(summary,recorded))throw new Error('Replay evidence differs; inspect before replay:record');}
  console.log(sources.length+' complete structured replay cases verified');
}catch(error){console.error(error instanceof Error?error.stack:String(error));process.exitCode=1;}

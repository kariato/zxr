import { isDeepStrictEqual } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadGame } from '../../src/engine/index.ts';
import { packBundle } from '../../src/zil/index.ts';
import { compileSourcePath } from '../zil/compile.ts';
import { authorConformanceCase, checkConformanceCase, conformanceSources } from './conformance.ts';
import { conformanceReview, loadDifferences } from './conformance-review.ts';
import type { ConformanceFixtures } from './conformance.ts';

export function runConformance(mode:'check'|'record'='check'){
  const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),sources=conformanceSources(),path='reference/conformance-inputs.json';
  const fixtures:ConformanceFixtures=mode==='record'?{format:'zxr-conformance-inputs-v1',buildHash:game.buildHash,cases:[]}:JSON.parse(readFileSync(path,'utf8'));
  if(fixtures.format!=='zxr-conformance-inputs-v1'||fixtures.buildHash!==game.buildHash)throw new Error('Conformance fixture build/format mismatch');
  if(mode==='check'&&JSON.stringify(fixtures.cases.map(c=>c.id))!==JSON.stringify(sources.map(s=>s.id)))throw new Error('Conformance golden script coverage differs');
  loadDifferences();
  if(mode==='check'){const review=conformanceReview(game);if(!isDeepStrictEqual(review,JSON.parse(readFileSync('reference/conformance-review.json','utf8'))))throw new Error('Conformance ledger review changed; review before conformance-review:record');}
  const cases=[];
  for(const source of sources){
    const fixture=mode==='record'?authorConformanceCase(game,source):fixtures.cases.find(c=>c.id===source.id)!;
    if(mode==='record')fixtures.cases.push(fixture);
    const result=checkConformanceCase(game,source,fixture);cases.push(result);
    console.log(`${result.id}: ${result.inputs} inputs, ${result.checkpoints} exposed + ${result.internalCheckpoints} internal checkpoints, ${result.gameDraws} game draws; text/state/RNG checked (${result.parserDraws} parser draws skipped; ${result.textDifferences.length} ledger text differences)`);
  }
  const summary={format:'zxr-conformance-v1',buildHash:game.buildHash,cases};
  if(mode==='record'){writeFileSync(path,JSON.stringify(fixtures,null,2)+'\n');writeFileSync('reference/conformance.json',JSON.stringify(summary,null,2)+'\n');}
  else {
    const recorded=JSON.parse(readFileSync('reference/conformance.json','utf8'));
    if(!isDeepStrictEqual(summary,recorded))throw new Error('Conformance evidence differs; inspect before recording');
  }
  console.log(`${cases.length}/${sources.length} golden scripts passed conformance; ${cases.reduce((n,c)=>n+c.checkpoints+c.internalCheckpoints,0)} checkpoints; ${cases.reduce((n,c)=>n+c.textDifferences.length,0)} ledger text differences`);
}

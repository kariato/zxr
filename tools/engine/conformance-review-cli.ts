import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { loadGame } from '../../src/engine/index.ts';
import { packBundle } from '../../src/zil/index.ts';
import { compileSourcePath } from '../zil/compile.ts';
import { conformanceReview } from './conformance-review.ts';
try{
  const [mode,...extra]=process.argv.slice(2);if(!['check','record'].includes(mode??'')||extra.length)throw new Error('Usage: conformance-review-cli.ts check|record');
  const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),review=conformanceReview(game),path='reference/conformance-review.json';
  if(mode==='record')writeFileSync(path,JSON.stringify(review,null,2)+'\n');
  else if(!isDeepStrictEqual(review,JSON.parse(readFileSync(path,'utf8'))))throw new Error('Ledger review differs; inspect before conformance-review:record');
  console.log(`Ledger reviewed: ${review.ledgerIds.length} unique IDs; ${review.exceptions.length} exact text exception; no additional state/RNG tolerance.`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}

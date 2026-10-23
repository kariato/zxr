import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadGame } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/index.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { conformanceReview, ledgerIds, validateDifferences } from '../tools/engine/conformance-review.ts';
import type { Differences } from '../tools/engine/conformance-review.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),ledger=readFileSync('games/zork2/ledger.md','utf8');
const policy=()=>JSON.parse(readFileSync('reference/conformance-differences.json','utf8')) as Differences;
const evidence=()=>JSON.parse(readFileSync('reference/conformance.json','utf8'));
it('reproduces the reviewed ledger and independently replays the binary text discrepancy',()=>{
  const review=conformanceReview(game);expect(review).toEqual(JSON.parse(readFileSync('reference/conformance-review.json','utf8')));
  expect(review.exceptions).toHaveLength(1);expect(review.exceptions[0]!.ledger).toBe('SRC-013');
});
it('rejects duplicate ledger IDs and missing exception decisions',()=>{
  expect(()=>ledgerIds(ledger.replace('| REF-003 |','| REF-001 |'))).toThrow('unique');
  expect(()=>validateDifferences(policy(),ledger.replace(/^\| SRC-013 .*\n/m,''))).toThrow('identity');
  expect(()=>conformanceReview(game,evidence(),ledger.replace(/^\| REF-001 .*\n/m,''))).toThrow('Missing reviewed decision REF-001');
});
it('rejects widening, adding or relabelling text tolerances',()=>{
  for(const change of [(p:Differences)=>p.text.push({...p.text[0]!}), (p:Differences)=>{p.text[0]!.ledger='RNG-001';}, (p:Differences)=>{p.text[0]!.input++;}, (p:Differences)=>{p.text[0]!.engineText=p.text[0]!.engineText.slice(1);},(p:Differences)=>{p.text[0]!.referenceText+=' ';}]){
    const p=policy();change(p);expect(()=>validateDifferences(p,ledger)).toThrow(/Unreviewed|full texts/);
  }
  expect(()=>validateDifferences({...policy(),ignoreState:true},ledger)).toThrow('Unreviewed');
});
it('rejects unknown adaptation policies and unexpected evidence exceptions',()=>{
  const unknown=evidence();unknown.cases[0].adaptations.push({kind:'skip-game-state'});expect(()=>conformanceReview(game,unknown)).toThrow('Unreviewed input');
  const widened=evidence();widened.cases[0].textDifferences.push({ledger:'SRC-013',input:0,referenceHash:'x',engineHash:'y'});expect(()=>conformanceReview(game,widened)).toThrow('unreviewed text');
});

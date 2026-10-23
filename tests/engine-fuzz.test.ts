import { readFileSync } from 'node:fs';
import { runReference } from '../tools/reference/runner.ts';
import { expect, it } from 'vitest';
import { GameSession, loadGame } from '../src/engine/index.ts';
import type { SelectionRequest } from '../src/engine/index.ts';
import { validateSessionState } from '../src/engine/testing.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { FuzzFailure, FuzzRandom, fuzzGame, fuzzGameIndices, fuzzWords } from '../tools/engine/fuzz.ts';
import { checkKeyOrder, shuffleKeys } from '../tools/engine/key-order.ts';
const bundle=compileSourcePath('reference/zork2'),game=loadGame(packBundle(bundle));
it('samples all offered vocabulary pages rather than only the first hundred groups',()=>{
  const s=new GameSession(game),before=s.stateHash(),words=fuzzWords(s);expect(words).toHaveLength(681);expect(new Set(words.map(w=>w.dictionaryIndex)).size).toBe(681);expect(words.some(w=>w.word==='WELL')).toBe(true);expect(s.stateHash()).toBe(before);
});
it('runs the same fixed choices and game RNG identically and validates every boundary',()=>{
  const config={seed:12345,game:7,turns:12},first=fuzzGame(game,config);expect(fuzzGame(game,config)).toEqual(first);expect(first.inputs).toBeGreaterThan(0);expect(first.actions+first.decisions).toBe(first.inputs);
},120000);
it('partitions all 10000 game indices exactly once with stable seeds and rejects malformed campaign ranges',()=>{
  const rows=Array.from({length:64},(_,shard)=>fuzzGameIndices(10000,0,shard,64)).flat();expect(rows).toHaveLength(10000);expect(new Set(rows).size).toBe(10000);expect(rows.sort((a,b)=>a-b)).toEqual(fuzzGameIndices(10000));
  expect(fuzzGameIndices(5,20,1,2)).toEqual([21,23]);expect(()=>fuzzGameIndices(0)).toThrow();expect(()=>fuzzGameIndices(2,0,2,2)).toThrow();expect(()=>fuzzGameIndices(2,0xffffffff)).toThrow();
});
it('captures a reproducible failure instead of skipping a rejected offered input',()=>{
  try{fuzzGame(game,{seed:12345,game:0,turns:1},{createSession:(game,seed)=>{const s=new GameSession(game,{seed});s.commitSelection=()=>({...s.opening(),status:'rejected',error:{cause:'injected offered rejection',source:null}});return s;}});throw new Error('Did not detect rejection');}
  catch(cause){expect(cause).toBeInstanceOf(FuzzFailure);expect((cause as FuzzFailure).record).toMatchObject({case:{seed:12345,game:0,turns:1},turn:1,stage:'commit',cause:'injected offered rejection',acceptedInputs:[]});}
},60000);
it('detects observation mutation and keeps validation pure',()=>{
  const s=new GameSession(game),before=s.stateHash();validateSessionState(s);expect(s.stateHash()).toBe(before);
  expect(()=>fuzzGame(game,{seed:2,game:1,turns:1},{createSession:(game,seed)=>{const s=new GameSession(game,{seed}),observe=s.observe.bind(s);const draft=s.menu().always.primary.find(c=>c.label==='Wait')!.draft;s.observe=()=>{const {epoch,revision}=observe();s.commitSelection({...draft,expected:{epoch,revision}});return observe();};return s;}})).toThrow('changed semantic state');
});
it('removes the source-ambiguous FOOTPAD operand and the ambiguous SAILOR alias without changing state',()=>{
  const s=new GameSession(game),before=s.stateHash(),menu=s.menu();expect(menu.objects.some(o=>o.operand==='FOOTPAD')).toBe(false);
  const family=[...menu.actions.primary,...menu.actions.more].find(c=>c.draft.family==='THROW:6')!;const direct=s.selectionMenu(family.draft).next!.choices;
  const sailor=[...direct.primary,...direct.more].find(c=>c.operand==='SAILOR'||typeof c.operand==='object'&&'object' in c.operand&&c.operand.object==='SAILOR')!;
  expect(sailor.spellings.some(o=>typeof o==='object'&&'noun' in o&&o.noun==='FOOTPAD')).toBe(false);
  const draft:SelectionRequest={...family.draft,operands:['SAILOR',{object:'GROUND',noun:'DIRT'}]};expect(s.commitSelection(draft).status).toBe('resolved');expect(before).not.toBe(s.stateHash());
});
it('keeps ordered arrays intact and compiles shuffled JSON source/components into identical bytes',()=>{
  const input={z:{last:9,first:1},a:[{two:2,one:1},3]},shuffled=shuffleKeys(input,new FuzzRandom(42));expect(shuffled).toEqual(input);expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(input));
  expect(checkKeyOrder(bundle,[42])).toMatchObject({buildHash:game.buildHash,compilerCases:1,componentCases:1,bundleCases:1});
},120000);
it('refuses to certify missing, duplicated, partial or mismatched shard results',async()=>{
  const {mergeFuzzResults}=await import('../tools/engine/fuzz-results.ts');const {fuzzSeeds}=await import('../tools/engine/fuzz.ts');
  const expected={buildHash:game.buildHash,seed:42,start:0,games:3,turns:2,shards:2};
  const rows=Array.from({length:2},(_,shard)=>{const cases=fuzzGameIndices(3,0,shard,2).map(game=>({game,...fuzzSeeds(42,game),inputs:2,actions:2,decisions:0,hosts:0,terminated:false,drafts:2,multiple:0,all:0,words:0,actors:0,stateHash:'0'.repeat(64)}));return {format:'zxr-fuzz-results-v1' as const,...expected,shard,elapsedMs:10,cases,totals:{games:cases.length,inputs:2*cases.length,actions:2*cases.length,decisions:0,hosts:0,terminated:0,drafts:2*cases.length,multiple:0,all:0,words:0,actors:0}};});
  expect(mergeFuzzResults(rows,expected)).toMatchObject({completedGames:3,inputs:6,inputBudget:6});expect(()=>mergeFuzzResults(rows.slice(0,1),expected)).toThrow('Incomplete');expect(()=>mergeFuzzResults([rows[0]!,rows[0]!],expected)).toThrow('duplicate');
  const partial=structuredClone(rows);partial[0]!.cases[0]!.inputs=1;partial[0]!.cases[0]!.actions=1;expect(()=>mergeFuzzResults(partial,expected)).toThrow('incomplete');
  const mismatched=structuredClone(rows);mismatched[1]!.seed++;expect(()=>mergeFuzzResults(mismatched,expected)).toThrow('Mismatched');
  const duplicate=structuredClone(rows);duplicate[0]!.cases[1]!.game=0;expect(()=>mergeFuzzResults(duplicate,expected)).toThrow('games');
  for(const seed of [-1,0x100000000,NaN])expect(()=>mergeFuzzResults(rows,{...expected,seed})).toThrow('configuration');
});
it('repairs the minimized CLIMB overread while preserving the original refusal and turn cost',()=>{
  const fixture=JSON.parse(readFileSync('reference/fuzz/climb-down-self.json','utf8')),s=new GameSession(game);
  const result=s.commitSelection(fixture.minimal.request);expect(result).toMatchObject({status:'resolved',moves:fixture.reference.moves});expect(result.error).toBeUndefined();validateSessionState(s);
  const original=runReference([fixture.reference.command]);expect(original.transcript[1]).toBe(fixture.reference.text);expect(original.final.moves).toBe(fixture.reference.moves);
  expect(result.text.join('')).toBe(fixture.reference.text);
});
it('keeps unsupported numeric and stream debug syntax out of public menus and rejects direct drafts',()=>{
  const s=new GameSession(game),before=s.stateHash(),set=s.candidates();expect(set.families.some(f=>f.lexicalTable.startsWith('#')||['AGAIN','OOPS'].includes(f.lexicalTable))).toBe(false);
  for(const family of ['#RANDOM:1','#COMMAND:1','#RECORD:1','#UNRECORD:1'])expect(s.commitSelection({actor:'PLAYER',expected:{epoch:1,revision:1},family,operands:[]}).status).toBe('rejected');
  expect(s.stateHash()).toBe(before);
});
it('accepts the source $VERIFY family offered by the menu and verifies the validated bundle',()=>{
  const s=new GameSession(game),menu=s.menu(),choice=[...menu.actions.primary,...menu.actions.more].find(c=>c.draft.family==='$VERIFY:1')!;
  expect(choice).toBeDefined();expect(s.selectionMenu(choice.draft).ready).toBe(true);
  const result=s.commitSelection(choice.draft);expect(result.status).not.toBe('rejected');expect(result.status).not.toBe('error');expect(result.status).toBe('resolved');expect(JSON.stringify(result)).toContain('The disk is correct.');validateSessionState(s);
});

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GameSession, loadGame } from '../src/engine/index.ts';
import { TextPlayer } from '../src/player/controller.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { checkOptionCoverage, oracleTape, validateOptionInputs } from '../tools/engine/option-coverage.ts';
import type { OptionFixtures } from '../tools/engine/option-coverage.ts';
import type { ReplayFixtures } from '../tools/engine/replay.ts';
import { commitOfferedAction } from '../tools/engine/offered-action.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
const base=JSON.parse(readFileSync('reference/structured-replay.json','utf8')) as ReplayFixtures;
const extra=()=>JSON.parse(readFileSync('reference/option-replay.json','utf8')) as OptionFixtures;
it('reproduces all required offered-option evidence with 100% coverage and full-score victory through shell controls',()=>{
  const result=checkOptionCoverage(game,base,extra());expect(result).toEqual(JSON.parse(readFileSync('reference/option-coverage.json','utf8')));
  expect(result.offered).toBe(result.total);expect(result.unsupported).toBe(0);expect(result.cases).toHaveLength(17);
  expect(result.cases.find(c=>c.id==='walkthrough')!.final).toMatchObject({score:400,won:true,deaths:0});
  expect(result.cases.find(c=>c.id==='restore-mid-keyhole')!.final.score).toBe(105);
},900000);
it('fails on missing scripts or actions and wrong identities instead of silently omitting coverage',()=>{
  const missing=structuredClone(base);missing.cases.pop();expect(()=>validateOptionInputs(game,missing,extra())).toThrow('cases');
  const changed=structuredClone(base);changed.cases[0]!.actions.pop();expect(()=>validateOptionInputs(game,changed,extra())).toThrow('Missing authored');
  const extras=extra();extras.cases[0]!.commands[0]='look';expect(()=>validateOptionInputs(game,base,extras)).toThrow('script');
});
it('rejects a family, actor, spelling or vocabulary word absent from offered controls',()=>{
  for(const action of [
    {kind:'act',actor:'PLAYER',verb:'OPEN',lexicalTable:'MISSING',syntax:1},
    {kind:'walk',actor:'ROBOT',direction:'NORTH'},
    {kind:'act',actor:'PLAYER',verb:'TAKE',lexicalTable:'TAKE',syntax:8,prso:{object:'COLLAR',noun:'COLLAR'}},
    {kind:'act',actor:'PLAYER',verb:'TAKE',lexicalTable:'TAKE',syntax:8,prso:{object:'LAMP',noun:'SWORD'}},
    {kind:'say',actor:'PLAYER',verb:'SAY',lexicalTable:'SAY',syntax:1,words:['NOTAVAILABLE']},
  ] as const){const s=new GameSession(game),before=s.stateHash();expect(()=>commitOfferedAction(game,new TextPlayer(s),action as never)).toThrow();expect(s.stateHash()).toBe(before);}
});
it('rewinds oracle tape slots on restore and rejects incompatible restored branches or unused tails',()=>{
  const draw=(input:number,result:number)=>({input,category:'game',range:10,result});
  const run={commands:['save','a','restore','a'],host:[{input:0,operation:'save',success:true},{input:2,operation:'restore',success:true}],random:[draw(1,2),draw(3,2)]};
  expect(oracleTape(run as never)).toEqual({tape:[{range:10,result:2}],cursors:[0,1,0,1]});
  expect(()=>oracleTape({...run,random:[draw(1,2),draw(3,3)]} as never)).toThrow('slot');
  expect(()=>oracleTape({...run,commands:run.commands.slice(0,3),random:[draw(1,2)]} as never)).toThrow('unused');
});

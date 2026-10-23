import { expect, it } from 'vitest';
import { GameSession, loadGame } from '../src/engine/index.ts';
import { TextPlayer } from '../src/player/controller.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { packBundle } from '../src/zil/bundle.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
const snapshot=(s:GameSession)=>({hash:s.stateHash(),save:s.exportSave(),inputs:s.acceptedInputs()});
const choose=(p:TextPlayer,label:string)=>{let v=p.view();if(!v.choices.some(c=>c.label===label)){const more=v.choices.find(c=>c.label.startsWith('More actions'));if(more){p.choose(more.key);v=p.view();}}const c=v.choices.find(c=>c.label===label);expect(c,'Missing '+label).toBeDefined();p.choose(c!.key);};
it('finishes take sword without a container and records the shorter source action',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),before=snapshot(s);choose(p,'Objects');choose(p,'elvish sword');choose(p,'Take: elvish sword from [object]');
  expect(p.view().title).toBe('Take: elvish sword from [object]');expect(p.view().canFinish).toBe(true);expect(p.view().finishLabel).toBe('Take: elvish sword');expect(snapshot(s)).toEqual(before);
  expect(p.finish()).toBe(true);expect(p.lastResult.status).toBe('resolved');expect(p.lastResult.text.join('')).toContain('Taken.');expect(s.observe().moves).toBe(1);
  const input=s.acceptedInputs()[0]!;expect(input.kind==='selection'&&input.request.family).toBe('TAKE:8');expect(GameSession.replay(game,{},s.acceptedInputs()).stateHash()).toBe(s.stateHash());
});
it('does not invent missing required objects or reinterpret a different verb/preposition',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),before=snapshot(s);choose(p,'Actions');choose(p,'Put: [object] in [object]');
  expect(p.view().canFinish).toBe(false);expect(p.finish()).toBe(false);choose(p,'elvish sword');expect(p.view().canFinish).toBe(false);expect(p.finish()).toBe(false);expect(snapshot(s)).toEqual(before);
  p.cancel();choose(p,'Actions');choose(p,'Take up: [object]');expect(p.finish()).toBe(false);expect(snapshot(s)).toEqual(before);
});
it('can finish while choosing a source spelling or a nonempty multiple-object list',()=>{
  const s=new GameSession(game),p=new TextPlayer(s);choose(p,'Actions');choose(p,'Take: [object]');choose(p,'elvish sword');expect(p.view().title).toContain('Choose wording:');expect(p.finish()).toBe(true);expect(p.lastResult.text.join('')).toContain('Taken.');
  choose(p,'Actions');choose(p,'Take: [object]');choose(p,'Choose multiple objects');const before=snapshot(s);expect(p.finish()).toBe(false);expect(snapshot(s)).toEqual(before);choose(p,'Select: lamp');expect(p.view().canFinish).toBe(true);expect(p.finish()).toBe(true);expect(p.lastResult.status).toBe('resolved');
});
it('cancels at every local navigation stage and clears words, spelling, multiple choices and stale controls',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),before=snapshot(s);
  for(const steps of [[],['Objects'],['Objects','elvish sword'],['Actions'],['Actions','Put: [object] in [object]'],['Actions','Take: [object]','elvish sword'],['Actions','Take: [object]','Choose multiple objects','Select: lamp']]){
    for(const step of steps)choose(p,step);const stale=p.view().choices[0]?.key;expect(p.cancel()).toBe(true);if(stale)expect(()=>p.choose(stale)).toThrow('Unavailable');expect(p.view().title).toBe('Choose an action');expect(p.view().canFinish).toBe(false);expect(snapshot(s)).toEqual(before);
  }
  choose(p,'Actions');choose(p,'Say: [words]');p.addWord(game.bundle.payload.vocabulary.words.find(w=>w.name==='HELLO')!.dictionaryIndex);expect(p.view().canFinish).toBe(true);p.cancel();expect(p.view().canUndoWord).toBe(false);expect(snapshot(s)).toEqual(before);
});
it('never treats a source decision as an uncommitted sentence',()=>{
  const s=new GameSession(game),p=new TextPlayer(s);choose(p,'Actions');choose(p,'Quit');expect(p.finish()).toBe(true);expect(p.view().state).toBe('pending');const before={hash:s.stateHash(),inputs:s.acceptedInputs()};expect(p.cancel()).toBe(false);expect(p.finish()).toBe(false);expect(p.view().canCancel).toBe(false);expect({hash:s.stateHash(),inputs:s.acceptedInputs()}).toEqual(before);
});

import { expect, it } from 'vitest';
import { GameSession, WorldState, loadGame } from '../src/engine/index.ts';
import type { ZxrSave } from '../src/engine/index.ts';
import { TextPlayer } from '../src/player/controller.ts';
import { resolveHost } from '../src/player/host.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { packBundle } from '../src/zil/bundle.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
const choose=(p:TextPlayer,label:string)=>{const c=p.view().choices.find(c=>c.label===label);expect(c,'Missing '+label).toBeDefined();p.choose(c!.key);};
const find=(p:TextPlayer,label:string)=>{let view=p.view();if(!view.choices.some(c=>c.label===label)){const more=view.choices.find(c=>c.label.startsWith('More actions'));if(more)p.choose(more.key);}choose(p,label);};
const commit=(p:TextPlayer)=>{const c=p.view().choices.find(c=>c.label.startsWith('Do: '));expect(c).toBeDefined();p.choose(c!.key);};
const action=(p:TextPlayer,label:string)=>{choose(p,'Actions');find(p,label);commit(p);};
const unchanged=(s:GameSession)=>({hash:s.stateHash(),save:s.exportSave(),log:s.acceptedInputs()});
it('browses, expands, chooses source wording, backs out and commits an object action without spending browsing turns',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),before=unchanged(s);choose(p,'Objects');choose(p,'lamp');find(p,'Take: lamp');
  expect(p.view().title).toBe('Take: lamp');expect(unchanged(s)).toEqual(before);choose(p,'Cancel');expect(unchanged(s)).toEqual(before);
  choose(p,'Objects');choose(p,'lamp');find(p,'Take: lamp');commit(p);expect(s.observe().moves).toBe(1);
  expect(p.transcript.at(-1)!.text).toContain('Taken.');expect(GameSession.replay(game,{},s.acceptedInputs()).stateHash()).toBe(s.stateHash());
  choose(p,'Actions');find(p,'Put: [object] in [object]');find(p,'lamp');expect(p.view().title).toContain('Choose wording:');
  const spelling=p.view().choices.find(c=>c.label==='brass lantern')!;expect(spelling).toBeDefined();p.choose(spelling.key);expect(p.view().title).toBe('Put: lamp in [object]');
  choose(p,'Back');expect(p.view().title).toBe('Put: [object] in [object]');choose(p,'Cancel');
});
it('handles selected words and spelling aliases without typed input or losing a draft on an invalid word',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),before=unchanged(s);choose(p,'Actions');find(p,'Say: [words]');expect(p.view().words).toBe(true);
  const index=(word:string)=>game.bundle.payload.vocabulary.words.find(w=>w.name===word)!.dictionaryIndex;
  p.addWord(index('W'));p.addWord(index('WEST'));expect(p.view().title).toBe('Say: “w west”');expect(unchanged(s)).toEqual(before);
  expect(()=>p.addWord(-1)).toThrow();expect(p.view().title).toBe('Say: “w west”');choose(p,'Remove last word');expect(p.view().title).toBe('Say: “w”');
  commit(p);expect(s.observe().moves).toBe(1);expect(GameSession.replay(game,{},s.acceptedInputs()).stateHash()).toBe(s.stateHash());
});
it('offers explicit multiple objects and ALL through staged actions without advancing on selection',()=>{
  const s=new GameSession(game),p=new TextPlayer(s);choose(p,'Actions');find(p,'Take: [object]');choose(p,'Choose multiple objects');
  const before=unchanged(s);choose(p,'Select: lamp');choose(p,'Select: elvish sword');expect(unchanged(s)).toEqual(before);choose(p,'Use selected objects');expect(p.view().title).toContain('lamp, elvish sword');commit(p);
  expect(s.observe().moves).toBe(1);choose(p,'Actions');find(p,'Take: [object]');choose(p,'All objects');expect(p.view().title).toBe('Take: all objects');choose(p,'Cancel');
});
it('routes primitive saves/restores, storage failures, invalid save rejection and restart decisions through the correlated protocol',()=>{
  const s=new GameSession(game),p=new TextPlayer(s);let saved:ZxrSave|undefined;const store={read:()=>saved!,write:(save:ZxrSave)=>{saved=save;}};
  choose(p,'Menu: look, inventory, wait, score, save');find(p,'Save');commit(p);expect(p.host?.kind).toBe('SAVE');expect(resolveHost(p,store)).toBeUndefined();expect(saved!.kind).toBe('primitive-save');
  choose(p,'Menu: look, inventory, wait, score, save');find(p,'Wait');commit(p);const moves=s.observe().moves;
  action(p,'Restore');expect(resolveHost(p,store)).toBeUndefined();expect(s.observe().moves).toBeLessThan(moves);expect(s.observe().state).toBe('input');
  action(p,'Restore');expect(resolveHost(p,{...store,read:()=>({} as ZxrSave)})).toBeTruthy();expect(s.observe().state).toBe('input');
  choose(p,'Menu: look, inventory, wait, score, save');find(p,'Save');commit(p);expect(resolveHost(p,{...store,write:()=>{throw new Error('Disk full');}})).toBe('Disk full');expect(s.observe().state).toBe('input');
  action(p,'Restart');expect(s.observe().state).toBe('pending');choose(p,'YES');expect(p.host?.kind).toBe('RESTART');resolveHost(p,store);expect(s.observe().moves).toBe(0);
  expect(GameSession.replay(game,{},s.acceptedInputs()).stateHash()).toBe(s.stateHash());
});
it('returns to player navigation after a robot leaves the player room',()=>{
  const s=new GameSession(game),save=s.exportSave(),w=WorldState.restore(game,save.checkpoint.interpreter.world),room=game.bundle.payload.world.entities.find(e=>e.name==='MAGNET-ROOM')!.id;
  w.move(w.global('PLAYER'),room);w.setGlobal('HERE',room);save.checkpoint.interpreter.world=w.snapshot();s.importSave(save);const p=new TextPlayer(s);
  choose(p,'Change actor');find(p,'robot');choose(p,'Exits');find(p,'robot — Go: west');commit(p);expect(s.observe().moves).toBe(1);expect(p.view().title).toBe('Choose an action');
});
it('invalidates local drafts on import and keeps quit terminal rather than rendering ordinary actions',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),save=s.exportSave();choose(p,'Objects');const stale=p.view().choices[0]!.key;p.importSave(save);expect(()=>p.choose(stale)).toThrow('Unavailable');
  action(p,'Quit');choose(p,'YES');resolveHost(p,{read:()=>save,write:()=>{}});expect(p.view().state).toBe('terminal');expect(p.view().choices).toEqual([]);
});

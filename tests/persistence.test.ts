import { expect, it } from 'vitest';
import { GameSession, loadGame } from '../src/engine/index.ts';
import type { ZxrSave } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { GameSaves } from '../src/persistence/saves.ts';
import type { TextStore } from '../src/persistence/indexed-db-save-store.ts';
import { IndexedDbSaveStore } from '../src/persistence/indexed-db-save-store.ts';
import { TextPlayer } from '../src/player/controller.ts';
import { resolveHostAsync } from '../src/player/host.ts';
const game=loadGame(packBundle(compileSourcePath('reference/zork2')));
class MemoryStore implements TextStore {
  data=new Map<string,string>();
  async read(key:string){return this.data.get(key)??null;}
  async write(key:string,text:string){this.data.set(key,text);}
  async keys(){return [...this.data.keys()];}
  async remove(key:string){this.data.delete(key);}
}
const choose=(p:TextPlayer,label:string)=>{let view=p.view();if(!view.choices.some(c=>c.label===label)){const more=view.choices.find(c=>c.label.startsWith('More actions'));if(more){p.choose(more.key);view=p.view();}}const c=view.choices.find(c=>c.label===label);expect(c,'Missing '+label).toBeDefined();p.choose(c!.key);};
const action=(p:TextPlayer,label:string)=>{choose(p,['Save','Wait','Look'].includes(label)?'Menu: look, inventory, wait, score, save':'Actions');choose(p,label);const c=p.view().choices.find(c=>c.label.startsWith('Do: '))!;p.choose(c.key);};
const deferred=()=>{let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
it('round trips isolated named checkpoints and autosaves with identical semantics and fresh protocol identity',async()=>{
  const store=new MemoryStore(),repo=new GameSaves(game,store),s=new GameSession(game),p=new TextPlayer(s);
  action(p,'Wait');const save=s.exportSave(),hash=s.stateHash();await repo.autosave(save);await repo.saveNamed('  before / maze  ',save);
  save.knowledge.push('not owned');expect((await repo.readNamed('before / maze')).knowledge).not.toContain('not owned');
  action(p,'Wait');await repo.autosave(s.exportSave());expect(await repo.names()).toEqual(['before / maze']);
  const loaded=new GameSession(game),epoch=loaded.observe().epoch;loaded.importSave(await repo.readNamed('before / maze'));
  expect(loaded.stateHash()).toBe(hash);expect(loaded.observe().epoch).toBeGreaterThan(epoch);
  expect((await repo.readAutosave())!.checkpoint).not.toEqual((await repo.readNamed('before / maze')).checkpoint);
  await repo.removeNamed('before / maze');expect(await repo.names()).toEqual([]);expect(await repo.readAutosave()).not.toBeNull();
  await expect(repo.readNamed('before / maze')).rejects.toThrow('not found');
  for(const name of ['', 'x'.repeat(101), 'bad\nname'])await expect(repo.saveNamed(name,s.exportSave())).rejects.toThrow('name');
});
it('rejects schema, build, ABI and corrupt continuation without changing the live session',async()=>{
  const store=new MemoryStore(),repo=new GameSaves(game,store),s=new GameSession(game),save=s.exportSave();
  for(const input of ['{','{}',JSON.stringify({...save,buildHash:'wrong'}),JSON.stringify({...save,abi:'wrong'})])expect(()=>repo.parse(input)).toThrow();
  const hash=s.stateHash(),before=s.exportSave();const corrupt=structuredClone(save);corrupt.checkpoint.interpreter.frames[0]!.routine=1;
  await repo.saveNamed('corrupt',corrupt);expect(()=>s.importSave(repo.parse(JSON.stringify(corrupt)))).toThrow();
  expect(s.stateHash()).toBe(hash);expect(s.exportSave()).toEqual(before);
});
it('keeps source SAVE separate, migrates a legacy slot, and resumes the actual success continuation',async()=>{
  const store=new MemoryStore(),s=new GameSession(game),p=new TextPlayer(s);action(p,'Save');const primitive=p.host!.save!;
  const repo=new GameSaves(game,store,()=>JSON.stringify(primitive));await repo.autosave(new GameSession(game).exportSave());
  await expect(repo.autosave(primitive)).rejects.toThrow('ordinary');await expect(repo.saveNamed('bad',primitive)).rejects.toThrow('ordinary');
  expect(await resolveHostAsync(p,{write:save=>repo.writeSource(save),read:()=>repo.readSource()})).toBeUndefined();const hash=s.stateHash();
  const loaded=new GameSession(game),packet=loaded.importSave(await new GameSaves(game,new MemoryStore(),()=>JSON.stringify(primitive)).readSource());
  expect(packet.text.join('')).toContain('Ok.');expect(loaded.stateHash()).toBe(hash);expect((await repo.readAutosave())!.kind).toBe('boundary');
  await expect(repo.writeSource(s.exportSave())).rejects.toThrow('continuation');
});
it('waits for durable SAVE acknowledgement and does not complete stale or duplicate requests',async()=>{
  const s=new GameSession(game),p=new TextPlayer(s);action(p,'Save');const first=deferred(),second=deferred();
  const a=resolveHostAsync(p,{write:()=>first.promise,read:async()=>({} as ZxrSave)});
  const b=resolveHostAsync(p,{write:()=>second.promise,read:async()=>({} as ZxrSave)});
  expect(s.observe().state).toBe('host');first.resolve();expect(await a).toBeUndefined();const hash=s.stateHash();
  action(p,'Save');const newer=p.host;second.resolve();expect(await b).toContain('changed');expect(p.host).toEqual(newer);expect(s.observe().state).toBe('host');
  expect(await resolveHostAsync(p,{write:async()=>{throw new Error('Quota exceeded');},read:async()=>({} as ZxrSave)})).toBe('Quota exceeded');
  expect(s.observe().state).toBe('input');expect(p.transcript.at(-1)!.text).toContain('Failed');expect(s.stateHash()).not.toBe(hash);
  action(p,'Restore');expect(await resolveHostAsync(p,{write:async()=>{},read:async()=>({} as ZxrSave)})).toBeTruthy();expect(s.observe().state).toBe('input');
});
it('reports unavailable IndexedDB and allows a later queued write to retry',async()=>{
  const store=new IndexedDbSaveStore();await expect(store.write('a','one')).rejects.toThrow('unavailable');await expect(store.write('b','two')).rejects.toThrow('unavailable');
});
it('rejects a valid envelope stored under the wrong slot kind',async()=>{
  const store=new MemoryStore(),repo=new GameSaves(game,store),s=new GameSession(game),p=new TextPlayer(s);action(p,'Save');
  await store.write(game.buildHash+':auto',JSON.stringify(p.host!.save));await expect(repo.readAutosave()).rejects.toThrow('kind mismatch');
  await store.write(game.buildHash+':source',JSON.stringify(new GameSession(game).exportSave()));await expect(repo.readSource()).rejects.toThrow('kind mismatch');
});

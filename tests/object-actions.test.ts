import { beforeAll,expect,it } from 'vitest';
import { GameSession,loadGame,WorldState } from '../src/engine/index.ts';
import type { LoadedGame } from '../src/engine/index.ts';
import { createBundle,packBundle } from '../src/zil/bundle.ts';
import type { GameBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { TextPlayer } from '../src/player/controller.ts';
import { buildObjectActionCatalog,observeObjectActions } from '../src/player/object-actions.ts';
let game:LoadedGame,bundle:GameBundle;
beforeAll(()=>{bundle=compileSourcePath('reference/zork2');game=loadGame(packBundle(bundle));},60000);
const fresh=()=>{const session=new GameSession(game);return {session,player:new TextPlayer(session,buildObjectActionCatalog(game))};};
const snapshot=(s:GameSession)=>({hash:s.stateHash(),save:s.exportSave(),inputs:s.acceptedInputs()});
function edit(s:GameSession,change:(w:WorldState)=>void){const save=s.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);change(world);save.checkpoint.interpreter.world=world.snapshot();s.importSave(save);}
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.kind==='attribute'&&s.name===name)!.number!;
it('gives every source object a static interaction profile without creating remote targets',()=>{
  const catalog=buildObjectActionCatalog(game),ids=catalog.objects.map(o=>o.id);
  expect(ids).toHaveLength(165);expect(new Set(ids).size).toBe(ids.length);
  expect(ids.toSorted()).toEqual(game.bundle.payload.world.entities.filter(e=>e.kind==='object').map(e=>e.name).toSorted());
  const {session,player}=fresh(),before=snapshot(session);expect(player.objectActions().map(a=>a.object).toSorted()).toEqual(['LAMP','SWORD']);
  expect(snapshot(session)).toEqual(before);
});
it('one sword activation submits the same complete source command and result as the menu',()=>{
  const {session,player}=fresh(),action=player.objectActions().find(a=>a.object==='SWORD')!,before=snapshot(session);
  expect(action.draft.family).toBe('TAKE:8');expect(snapshot(session)).toEqual(before);
  const other=fresh();other.session.commitSelection(action.draft);
  expect(player.activateObject(action)).toBe(true);expect(session.observe().moves).toBe(1);
  expect(player.lastResult.text.join('')).toContain('Taken.');expect(session.observe().perception.objects.find(o=>o.id==='SWORD')?.held).toBe(true);
  expect(session.stateHash()).toBe(other.session.stateHash());expect(session.acceptedInputs()).toHaveLength(1);
  expect(GameSession.replay(game,{},session.acceptedInputs()).stateHash()).toBe(session.stateHash());
});
it('cannot turn a duplicate or stale target into a second or different action',()=>{
  const {session,player}=fresh(),sword=player.objectActions().find(a=>a.object==='SWORD')!,lamp=player.objectActions().find(a=>a.object==='LAMP')!;
  player.activateObject(sword);const before=snapshot(session);
  expect(player.activateObject(sword)).toBe(false);expect(player.activateObject(lamp)).toBe(false);expect(snapshot(session)).toEqual(before);
  expect(player.objectActions().find(a=>a.object==='SWORD')!.draft.family).not.toBe('TAKE:8');
  const save=session.exportSave(),current=player.objectActions()[0]!;player.importSave(save);expect(player.activateObject(current)).toBe(false);
});
it('does not let a spatial click bypass a pending source decision',()=>{
  const {session,player}=fresh(),binding=player.objectActions().find(a=>a.object==='SWORD')!;
  const family=session.candidates().families.find(f=>f.verb==='QUIT'&&f.slots.length===0&&!f.shadowedBy)!;
  const {epoch,revision}=session.observe();session.commitSelection({expected:{epoch,revision},actor:'PLAYER',family:family.id,operands:[]});
  expect(session.observe().state).toBe('pending');const before={hash:session.stateHash(),inputs:session.acceptedInputs()};
  expect(player.objectActions()).toEqual([]);expect(player.activateObject(binding)).toBe(false);expect({hash:session.stateHash(),inputs:session.acceptedInputs()}).toEqual(before);
});
it('uses pickup then switch-on for the lamp and never changes state by animating first',()=>{
  const {session,player}=fresh();player.activateObject(player.objectActions().find(a=>a.object==='LAMP')!);
  expect(session.observe().moves).toBe(1);expect(session.observeAppearance().appearance.find(a=>a.id==='LAMP')?.on).toBe(false);
  const on=player.objectActions().find(a=>a.object==='LAMP')!;
  expect(on.draft.family).toBe('LIGHT:2');
  expect(session.candidates().families.find(f=>f.id===on.draft.family)?.verb).toBe('LAMP-ON');player.activateObject(on);
  expect(session.observe().moves).toBe(2);expect(session.observeAppearance().appearance.find(a=>a.id==='LAMP')?.on).toBe(true);
  expect(player.objectActions().find(a=>a.object==='LAMP')!.draft.family).not.toBe(on.draft.family);
});
it('removes invisible, contained and dark-room targets while keeping their source profiles',()=>{
  const {session,player}=fresh();edit(session,w=>w.setFlag(id('LAMP'),flag('INVISIBLE'),true));expect(player.objectActions().some(a=>a.object==='LAMP')).toBe(false);
  edit(session,w=>{w.move(id('TEAPOT'),id('INSIDE-BARROW'));w.move(id('SWORD'),id('TEAPOT'));w.setFlag(id('TEAPOT'),flag('OPENBIT'),false);w.setFlag(id('TEAPOT'),flag('TRANSBIT'),false);});
  expect(player.objectActions().some(a=>a.object==='SWORD')).toBe(false);
  edit(session,w=>{w.setFlag(id('INSIDE-BARROW'),flag('ONBIT'),false);w.setGlobal('ALWAYS-LIT',0);});expect(player.objectActions()).toEqual([]);
});
it('opening a locked door remains a source attempt, with no invented unlock or open state',()=>{
  const {session,player}=fresh();edit(session,w=>{w.move(w.global('PLAYER'),id('TINY-ROOM'));w.setGlobal('HERE',id('TINY-ROOM'));w.setFlag(id('TINY-ROOM'),flag('ONBIT'),true);w.setFlag(id('PDOOR'),flag('OPENBIT'),false);w.setGlobal('PUNLOCK-FLAG',0);});
  const door=player.objectActions().find(a=>a.object==='PDOOR')!;expect(door).toBeDefined();expect(session.candidates().families.find(f=>f.id===door.draft.family)?.verb).toBe('OPEN');
  expect(player.activateObject(door)).toBe(true);expect(session.observe().moves).toBe(1);expect(player.lastResult.text.join('')).toMatch(/locked/i);
  expect(session.observeAppearance().appearance.find(a=>a.id==='PDOOR')?.open).toBe(false);
});
it('does not promote a knowledge-gated pickup, but retains it in the ordinary source menu',()=>{
  const payload=structuredClone(bundle.payload);payload.gateRules.push({id:'test-pickup',source:'Test fixture only',learn:['A clue that has not been disclosed'],targets:[{verbs:['TAKE'],direct:['SWORD']}]});
  const gated=loadGame(packBundle(createBundle(payload,bundle.debug,bundle.licenses))),session=new GameSession(gated),player=new TextPlayer(session,buildObjectActionCatalog(gated));
  const sword=player.objectActions().find(a=>a.object==='SWORD')!;expect(sword.draft.family).not.toBe('TAKE:8');
  const group=session.menu().objects.find(o=>o.operand==='SWORD')!;expect([...group.choices.primary,...group.choices.more].find(c=>c.draft.family==='TAKE:8')?.placement).toBe('more');
});
it('rejects a different build and owns the catalogue and advertised binding data',()=>{
  const {session}=fresh(),catalog=buildObjectActionCatalog(game),player=new TextPlayer(session,catalog);catalog.objects.length=0;
  const action=player.objectActions().find(a=>a.object==='SWORD')!;action.draft.operands=['DRAGON'];action.label='Forged label';
  expect(player.activateObject(action)).toBe(true);expect(player.transcript.at(-1)?.command).not.toBe('Forged label');expect(player.lastResult.text.join('')).toContain('Taken.');
  const bad=fresh();expect(()=>observeObjectActions(bad.session,{...buildObjectActionCatalog(game),buildHash:'0'.repeat(64)})).toThrow('another game build');
});
it('browses spatial actions without turns, executes complete choices and retains partial sentences',()=>{
  const {session,player}=fresh(),before=snapshot(session);player.openObject('SWORD');
  let view=player.view();expect(view.title).toMatch(/sword/i);expect(snapshot(session)).toEqual(before);
  const more=view.choices.find(c=>c.label.startsWith('More actions'));if(more){player.choose(more.key);view=player.view();}
  const source=session.menu().objects.find(o=>o.operand==='SWORD')!;
  for(const c of [...source.choices.primary,...source.choices.more])expect(view.choices.some(v=>v.target?.family===c.draft.family)).toBe(true);
  const take=view.choices.find(c=>c.target?.family==='TAKE:8')!;expect(take).toBeDefined();player.choose(take.key);
  expect(session.observe().moves).toBe(1);expect(player.lastResult.text.join('')).toContain('Taken.');expect(player.view().title).toBe('Choose an action');
  player.openObject('SWORD');view=player.view();const partial=view.choices.find(c=>c.target?.family==='TAKE:1')!;
  expect(partial).toBeDefined();player.choose(partial.key);expect(session.observe().moves).toBe(1);expect(player.view().title).toContain('[object]');
});
it('ignores stale menu openings and choices after a source turn or restore',()=>{
  const {session,player}=fresh(),expected=session.observe();player.openObject('SWORD');let view=player.view();
  const more=view.choices.find(c=>c.label.startsWith('More actions'));if(more){player.choose(more.key);view=player.view();}
  const take=view.choices.find(c=>c.target?.family==='TAKE:8')!;
  session.importSave(session.exportSave());const before=snapshot(session);player.choose(take.key);expect(snapshot(session)).toEqual(before);
  player.openObject('SWORD',expected);expect(player.view().title).toBe('Choose an action');expect(snapshot(session)).toEqual(before);
});

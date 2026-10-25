import { beforeAll,expect,it } from 'vitest';
import { GameSession,loadGame,WorldState } from '../src/engine/index.ts';
import type { LoadedGame } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { TextPlayer } from '../src/player/controller.ts';
import {buildObjectActionCatalog} from '../src/player/object-actions.ts';
import { prototypeModel } from '../src/prototype/model.ts';
let game:LoadedGame;
beforeAll(()=>{game=loadGame(packBundle(compileSourcePath('reference/zork2')));},60000);
const choose=(p:TextPlayer,label:string)=>{
  let v=p.view();if(!v.choices.some(c=>c.label===label)){const more=v.choices.find(c=>c.label.startsWith('More actions'));if(more){p.choose(more.key);v=p.view();}}
  const c=v.choices.find(c=>c.label===label);expect(c,label).toBeDefined();p.choose(c!.key);
};
it('spatial object browsing is turn-free; take and drop update the observed prop presentation',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),before=s.stateHash();
  p.openObject('SWORD');expect(p.view().title).toBe('elvish sword');expect(s.stateHash()).toBe(before);
  choose(p,'Take: elvish sword');expect(p.finish()).toBe(false);
  expect(s.observe().moves).toBe(1);expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(true);
  p.openObject('SWORD');choose(p,'Drop: elvish sword');expect(p.finish()).toBe(false);
  expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(false);
  const unchanged=s.stateHash();p.openObject('DRAGON');expect(p.view().title).toBe('Choose an action');expect(s.stateHash()).toBe(unchanged);
});
it('source movement controls room changes, refusals, darkness and save restoration',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),save=s.exportSave();
  p.walk('NORTH');expect(s.observe().moves).toBe(1);expect(s.observe().perception.room?.id).toBe('INSIDE-BARROW');
  p.walk('SOUTH');expect(s.observe().moves).toBe(2);expect(s.observe().perception.room?.id).toBe('NARROW-TUNNEL');
  expect(prototypeModel(s.observeAppearance()).layout).not.toBeNull();
  p.walk('DOWN');expect(s.observe().moves).toBe(3);expect(s.observe().perception.room?.id).toBe('NARROW-TUNNEL');
  expect(p.transcript.at(-1)?.text).toContain('crumbling rocks');
  p.walk('CROSS');expect(s.observe().moves).toBe(4);expect(s.observe().perception.room?.id).toBe('FOOT-BRIDGE');
  p.walk('NORTH');expect(s.observe().perception.room?.id).toBe('NARROW-TUNNEL');
  p.importSave(save);expect(s.observe().perception.room?.id).toBe('INSIDE-BARROW');expect(s.observe().moves).toBe(0);
});
it('the renderer model discards hidden, contained and dark-room props on every observation',()=>{
  const s=new GameSession(game);s.opening();const o=s.observeAppearance();
  expect(prototypeModel(o).props).toHaveLength(2);
  o.perception.objects.find(p=>p.id==='SWORD')!.visible=false;
  Object.assign(o.perception.objects.find(p=>p.id==='LAMP')!,{carried:true,held:false});
  expect(prototypeModel(o).props).toEqual([]);
  o.perception.lit=false;expect(prototypeModel(o)).toEqual({room:null,layout:null,props:[]});
  o.perception.lit=true;o.perception.room={id:'CRYPT-ROOM',name:'Crypt'};
  expect(prototypeModel(o).layout).toBeNull();expect(prototypeModel(o).props).toEqual([]);
});
it('carries the same sword across shared cavern rooms and shows it only in its current source location after dropping',()=>{
  const s=new GameSession(game),p=new TextPlayer(s);
  p.openObject('SWORD');choose(p,'Take: elvish sword');
  for(const direction of ['SOUTH','SOUTH','SOUTH'])p.walk(direction);
  expect(s.observe().perception.room?.id).toBe('GREAT-CAVERN');
  expect(prototypeModel(s.observeAppearance()).layout?.routes.map(r=>r.direction)).toEqual(['NE','SW']);
  expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(true);
  const save=s.exportSave();
  p.openObject('SWORD');choose(p,'Drop: elvish sword');
  expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(false);
  p.walk('NE');expect(s.observe().perception.room?.id).toBe('FOOT-BRIDGE');
  expect(prototypeModel(s.observeAppearance()).props.some(o=>o.id==='SWORD')).toBe(false);
  p.walk('SOUTH');expect(prototypeModel(s.observeAppearance()).props.filter(o=>o.id==='SWORD')).toHaveLength(1);
  p.importSave(save);expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(true);
});
it('presents observed movable identities outside the environment slice while hiding container contents and dark objects',()=>{
  const s=new GameSession(game);s.opening();const save=s.exportSave();
  const world=WorldState.restore(game,save.checkpoint.interpreter.world);
  const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  world.move(world.global('PLAYER'),id('GARDEN-NORTH'));world.setGlobal('HERE',id('GARDEN-NORTH'));
  world.move(id('ROSE'),id('GARDEN-NORTH'));world.move(id('GOLD-KEY'),id('CHEST'));
  save.checkpoint.interpreter.world=world.snapshot();s.importSave(save);
  const observation=s.observeAppearance();
  expect(prototypeModel(observation).props.some(o=>o.id==='ROSE')).toBe(true);
  expect(prototypeModel(observation).props.some(o=>o.id==='GOLD-KEY')).toBe(false);
  observation.perception.lit=false;expect(prototypeModel(observation).props).toEqual([]);
});
it('shows the princess and chest only when observed, and keeps unseen chest contents hidden',()=>{
  const s=new GameSession(game);s.opening();const save=s.exportSave();
  const world=WorldState.restore(game,save.checkpoint.interpreter.world);
  const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  const on=game.bundle.payload.symbols.symbols.find(f=>f.kind==='attribute'&&f.name==='ONBIT')!.number!;
  world.move(world.global('PLAYER'),id('DRAGON-LAIR'));world.setGlobal('HERE',id('DRAGON-LAIR'));world.move(id('LAMP'),world.global('PLAYER'));world.setFlag(id('LAMP'),on,true);
  save.checkpoint.interpreter.world=world.snapshot();s.importSave(save);
  const observation=s.observeAppearance(),model=prototypeModel(observation);expect(model.layout).not.toBeNull();
  expect(model.props.some(p=>p.id==='PRINCESS')).toBe(true);expect(model.props.find(p=>p.id==='CHEST')?.open).toBe(false);expect(model.props.some(p=>p.id==='STATUETTE')).toBe(false);
  observation.perception.objects.find(o=>o.id==='PRINCESS')!.visible=false;expect(prototypeModel(observation).props.some(p=>p.id==='PRINCESS')).toBe(false);
  observation.perception.lit=false;expect(prototypeModel(observation).props).toEqual([]);
});

it('reveals Dark Tunnel only with source light and follows both junction branches',()=>{
  const s=new GameSession(game),p=new TextPlayer(s,buildObjectActionCatalog(game));
  // Carry the unlit lamp so it can be lit without a speculative move in darkness.
  p.activateObject(p.objectActions().find(a=>a.object==='LAMP')!);
  for(const d of ['SOUTH','SOUTH','SOUTH','SW'])p.walk(d);
  expect(prototypeModel(s.observeAppearance()).room).toBe('SHALLOW-FORD');
  expect(p.objectActions().some(a=>a.object==='GLOBAL-WATER')).toBe(true);
  expect(p.objectActions().some(a=>a.object==='STREAM'||a.object==='CHASM')).toBe(false);
  const ford=s.exportSave();
  p.walk('CROSS');expect(s.observe().perception.lit).toBe(false);
  expect(prototypeModel(s.observeAppearance())).toEqual({room:null,layout:null,props:[]});
  p.importSave(ford);p.activateObject(p.objectActions().find(a=>a.object==='LAMP')!);
  p.walk('SOUTH');expect(prototypeModel(s.observeAppearance()).room).toBe('DARK-TUNNEL');
  expect(prototypeModel(s.observeAppearance()).layout?.routes.map(r=>r.direction)).toEqual(['NE','SW','SE']);
  const junction=s.exportSave();p.walk('SE');expect(s.observe().perception.room?.id).toBe('GARDEN-NORTH');
  p.importSave(junction);p.walk('SW');expect(s.observe().perception.room?.id).toBe('STREAM-PATH');
  p.importSave(junction);p.walk('NE');expect(s.observe().perception.room?.id).toBe('SHALLOW-FORD');
});

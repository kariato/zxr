import { beforeAll,expect,it } from 'vitest';
import { GameSession,loadGame } from '../src/engine/index.ts';
import type { LoadedGame } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { TextPlayer } from '../src/player/controller.ts';
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
  choose(p,'Take: elvish sword');expect(p.finish()).toBe(true);
  expect(s.observe().moves).toBe(1);expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(true);
  p.openObject('SWORD');choose(p,'Drop: elvish sword');p.finish();
  expect(prototypeModel(s.observeAppearance()).props.find(o=>o.id==='SWORD')?.held).toBe(false);
  expect(()=>p.openObject('DRAGON')).toThrow('Object has no available actions');
});
it('source movement controls room changes, refusals, darkness and save restoration',()=>{
  const s=new GameSession(game),p=new TextPlayer(s),save=s.exportSave();
  p.walk('NORTH');expect(s.observe().moves).toBe(1);expect(s.observe().perception.room?.id).toBe('INSIDE-BARROW');
  p.walk('SOUTH');expect(s.observe().moves).toBe(2);expect(s.observe().perception.room?.id).toBe('NARROW-TUNNEL');
  expect(prototypeModel(s.observeAppearance()).layout).not.toBeNull();
  p.walk('SOUTH');expect(s.observe().moves).toBe(3);expect(s.observe().perception.room?.id).toBe('FOOT-BRIDGE');
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

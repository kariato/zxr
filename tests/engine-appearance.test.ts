import { beforeAll,describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameSession,Interpreter,WorldState,loadGame,queryAppearance } from '../src/engine/index.ts';
import type { LoadedGame } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';
import { selectSceneAppearance,selectSceneNodes } from '../src/presentation/scene-visibility.ts';
import type { SceneVisibility } from '../src/presentation/scene-visibility.ts';
import { checkSceneConsistency } from '../tools/planning/consistency.ts';
import { loadPlannerSources } from '../tools/planning/inputs.ts';
import { readDraftPlans } from '../tools/planning/store.ts';

let game:LoadedGame,initial:WorldState,scenes:SceneVisibility[];
beforeAll(()=>{
  const bundle=compileSourcePath('reference/zork2');game=loadGame(packBundle(bundle));const vm=new Interpreter(game);vm.run();initial=vm.world();
  const sources=loadPlannerSources(process.cwd(),bundle),docs=readDraftPlans(process.cwd(),sources).map(r=>r.document);
  scenes=checkSceneConsistency(docs,JSON.parse(readFileSync('games/zork2/planning/scene-bindings.json','utf8')),sources).scenes;
},60000);
const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.kind==='attribute'&&s.name===name)!.number!;
const set=(w:WorldState,object:string,name:string,value:boolean)=>w.setFlag(id(object),flag(name),value);
function layout(room:string){const w=initial.fork();w.move(id('ADVENTURER'),id(room));w.setGlobal('HERE',id(room));w.setGlobal('ALWAYS-LIT',0);set(w,room,'ONBIT',true);return w;}
describe('filtered visible surface appearance',()=>{
  it('exposes only declared open/container and light surface states, never arbitrary flags',()=>{
    const w=layout('INSIDE-BARROW'),o=queryAppearance(game,w);
    expect(o.appearance.find(a=>a.id==='LAMP')).toEqual({id:'LAMP',open:null,on:false});
    expect(o.appearance.find(a=>a.id==='SWORD')).toEqual({id:'SWORD',open:null,on:null});
    set(w,'SWORD','OPENBIT',true);set(w,'SWORD','ONBIT',true);expect(queryAppearance(game,w).appearance.find(a=>a.id==='SWORD')).toEqual({id:'SWORD',open:null,on:null});
    expect(o.appearance.every(a=>Object.keys(a).sort().join(',')==='id,on,open')).toBe(true);
  });
  it('excludes invisible, remote, opaque-contained and dark-room state',()=>{
    const w=layout('INSIDE-BARROW');set(w,'LAMP','INVISIBLE',true);expect(queryAppearance(game,w).appearance.some(a=>a.id==='LAMP')).toBe(false);
    set(w,'LAMP','INVISIBLE',false);w.move(id('LAMP'),id('DREARY-ROOM'));expect(queryAppearance(game,w).appearance.some(a=>a.id==='LAMP')).toBe(false);
    w.move(id('TEAPOT'),id('INSIDE-BARROW'));w.move(id('LAMP'),id('TEAPOT'));set(w,'TEAPOT','OPENBIT',false);set(w,'TEAPOT','TRANSBIT',false);
    expect(queryAppearance(game,w).appearance.some(a=>a.id==='LAMP')).toBe(false);
    set(w,'INSIDE-BARROW','ONBIT',false);expect(queryAppearance(game,w).appearance).toEqual([]);
  });
  it('does not interpret actor inventories or table surfaces as opening bodies',()=>{
    const w=layout('MAGNET-ROOM');w.move(id('ROBOT'),id('MAGNET-ROOM'));set(w,'ROBOT','INVISIBLE',false);
    expect(queryAppearance(game,w).appearance.find(a=>a.id==='ROBOT')?.open).toBeNull();
    const tableWorld=layout('TEA-ROOM');expect(queryAppearance(game,tableWorld).appearance.find(a=>a.id==='ALICE-TABLE')?.open).toBeNull();
  });
  it('drives lantern flicker from observed ONBIT and clears it after removal',()=>{
    const w=layout('INSIDE-BARROW'),scene=scenes.find(s=>s.room==='INSIDE-BARROW')!;
    expect(selectSceneAppearance(scene,queryAppearance(game,w),[]).clips).toEqual([{object:'LAMP',clip:'idle'}]);
    set(w,'LAMP','ONBIT',true);expect(selectSceneAppearance(scene,queryAppearance(game,w),[]).clips).toEqual([{object:'LAMP',clip:'flicker'}]);
    w.remove(id('LAMP'));expect(selectSceneAppearance(scene,queryAppearance(game,w),[]).clips).toEqual([]);
  });
  it('selects actual door/lid poses and enables just one passage when the visible door opens',()=>{
    const w=layout('TINY-ROOM'),scene=scenes.find(s=>s.room==='TINY-ROOM')!;
    set(w,'PDOOR','OPENBIT',false);set(w,'LID-1','OPENBIT',false);
    const closed=selectSceneAppearance(scene,queryAppearance(game,w),['NORTH','IN']);
    expect(closed.clips).toEqual([{object:'PDOOR',clip:'closed'},{object:'LID-1',clip:'closed'}]);expect(closed.exits).toEqual([]);
    set(w,'PDOOR','OPENBIT',true);set(w,'LID-1','OPENBIT',true);
    const current=queryAppearance(game,w),open=selectSceneAppearance(scene,current,['NORTH','IN']);
    expect(open.clips).toEqual([{object:'PDOOR',clip:'open'},{object:'LID-1',clip:'open'}]);expect(open.exits).toEqual(['exit_north']);
    expect(selectSceneNodes(scene,current.perception,['NORTH','IN']).exits).toEqual([]); // Missing surface state fails closed.
    set(w,'PDOOR','OPENBIT',false);expect(selectSceneAppearance(scene,queryAppearance(game,w),['NORTH']).exits).toEqual([]);
    set(w,'PDOOR','INVISIBLE',true);const hidden=selectSceneAppearance(scene,queryAppearance(game,w),['NORTH']);
    expect(hidden.objects).not.toContain('PDOOR');expect(hidden.clips).toEqual([]);expect(hidden.exits).toEqual([]);
  });
  it('clears poses when appearance is absent, unknown, dark or from another room',()=>{
    const w=layout('TINY-ROOM'),scene=scenes.find(s=>s.room==='TINY-ROOM')!,current=queryAppearance(game,w);
    current.appearance=[];expect(selectSceneAppearance(scene,current,['NORTH']).clips).toEqual([]);
    current.appearance=[{id:'PDOOR',open:null,on:null}];expect(selectSceneAppearance(scene,current,['NORTH']).clips).toEqual([]);
    current.perception.room!.id='DREARY-ROOM';current.appearance=[{id:'PDOOR',open:true,on:null}];expect(selectSceneAppearance(scene,current,['NORTH']).clips).toEqual([]);
  });
  it('returns owned data without changing world memory or session identity, RNG or saves',()=>{
    const w=layout('TINY-ROOM'),before=w.snapshot(),a=queryAppearance(game,w);a.appearance.length=0;a.perception.objects.length=0;
    expect(queryAppearance(game,w).appearance.length).toBeGreaterThan(0);expect(w.snapshot()).toEqual(before);
    const session=new GameSession(game),hash=session.stateHash(),save=session.exportSave(),observation=session.observe();
    const publicState=session.observeAppearance();expect(publicState.perception).toEqual(observation.perception);expect(publicState).toMatchObject({epoch:observation.epoch,revision:observation.revision});
    publicState.appearance.length=0;publicState.perception.objects.length=0;session.observeAppearance();
    expect(session.stateHash()).toBe(hash);expect(session.exportSave()).toEqual(save);
  });
});

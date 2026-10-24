import { describe,expect,it } from 'vitest';
import { selectSceneNodes } from '../src/presentation/scene-visibility.ts';
import type { SceneVisibility } from '../src/presentation/scene-visibility.ts';
import type { ScopeObservation } from '../src/engine/scope.ts';
import { Interpreter,WorldState,loadGame,queryScope } from '../src/engine/index.ts';
import { packBundle } from '../src/zil/bundle.ts';
import { compileSourcePath } from '../tools/zil/compile.ts';

const scene:SceneVisibility={room:'TINY-ROOM',objects:[{object:'PDOOR',asset:'asset_pdoor',anchor:'door'},{object:'PWINDOW',asset:'asset_pwindow',anchor:'window'}],
  attachments:[{object:'PWINDOW',parent:'PDOOR',socket:'window_insert'}],features:[{node:'door_detail',object:'PDOOR'}],
  exits:[{node:'exit_north',direction:'NORTH',physical:true},{node:'exit_in',direction:'IN',physical:false}]};
const observed=(ids:string[]):ScopeObservation=>({actor:'ADVENTURER',room:{id:'TINY-ROOM',name:'Tiny Room'},lit:true,
  objects:ids.map(id=>({id,name:id,visible:true,reachable:false,known:false,held:false,carried:false}))});
describe('observation-only scene variants',()=>{
  it('returns a replacement set and removes disappeared nodes, even if remembered or reachable',()=>{
    expect(selectSceneNodes(scene,observed(['PDOOR','PWINDOW']),['NORTH','IN'])).toEqual({objects:['PDOOR','PWINDOW'],features:['door_detail'],exits:['exit_north']});
    const next=observed(['PDOOR','PWINDOW']);next.objects.forEach(o=>{o.visible=false;o.known=true;o.reachable=true;});
    expect(selectSceneNodes(scene,next,[])).toEqual({objects:[],features:[],exits:[]});
    expect(selectSceneNodes(scene,observed([]),['IN']).exits).toEqual([]);
  });
  it('does not disclose another room or geometry in darkness',()=>{
    const o=observed(['PDOOR','PWINDOW']);o.room!.id='DREARY-ROOM';expect(selectSceneNodes(scene,o,['NORTH']).objects).toEqual([]);
    o.room!.id='TINY-ROOM';o.lit=false;expect(selectSceneNodes(scene,o,['NORTH'])).toEqual({objects:[],features:[],exits:[]});
    o.lit=true;o.room=null;expect(selectSceneNodes(scene,o,['NORTH']).features).toEqual([]);
  });
  it('suppresses attached children when a parent is absent and fails closed on cycles',()=>{
    expect(selectSceneNodes(scene,observed(['PWINDOW']),[]).objects).toEqual([]);
    const invalid=structuredClone(scene);invalid.attachments.push({object:'PDOOR',parent:'PWINDOW',socket:'cycle'});
    expect(selectSceneNodes(invalid,observed(['PDOOR','PWINDOW']),[]).objects).toEqual([]);
  });
  it('owns its result and does not mutate observation or bindings',()=>{
    const o=observed(['PDOOR','PWINDOW']),before=JSON.stringify({scene,o}),a=selectSceneNodes(scene,o,['NORTH']);a.objects.length=0;
    expect(selectSceneNodes(scene,o,['NORTH']).objects).toEqual(['PDOOR','PWINDOW']);expect(JSON.stringify({scene,o})).toBe(before);
  });
  it('follows actual source INVISIBLE and light flags through the engine observation boundary',()=>{
    const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),initial=new Interpreter(game);initial.run();
    const world=WorldState.restore(game,initial.world().snapshot());
    const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
    const flag=(name:string)=>game.bundle.payload.symbols.symbols.find(s=>s.kind==='attribute'&&s.name===name)!.number!;
    world.move(id('ADVENTURER'),id('INSIDE-BARROW'));world.setGlobal('HERE',id('INSIDE-BARROW'));world.setGlobal('ALWAYS-LIT',0);
    world.setFlag(id('INSIDE-BARROW'),flag('ONBIT'),true);
    // A controlled source-world layout tests disclosure, not puzzle reachability.
    world.move(id('DIM-DOOR'),id('INSIDE-BARROW'));world.setFlag(id('DIM-DOOR'),flag('INVISIBLE'),true);
    const secret:SceneVisibility={room:'INSIDE-BARROW',objects:[{object:'DIM-DOOR',asset:'asset_dim-door',anchor:'secret'}],attachments:[],features:[{node:'concealed_opening',object:'DIM-DOOR'}],exits:[]};
    const hidden=queryScope(game,world).observation;expect(selectSceneNodes(secret,hidden,[]).features).toEqual([]);
    world.setFlag(id('DIM-DOOR'),flag('INVISIBLE'),false);
    const before=world.snapshot();expect(selectSceneNodes(secret,queryScope(game,world).observation,[]).features).toEqual(['concealed_opening']);expect(world.snapshot()).toEqual(before);
    world.setFlag(id('DIM-DOOR'),flag('INVISIBLE'),true);expect(selectSceneNodes(secret,queryScope(game,world).observation,[]).features).toEqual([]);
    world.setFlag(id('DIM-DOOR'),flag('INVISIBLE'),false);world.setFlag(id('INSIDE-BARROW'),flag('ONBIT'),false);world.setFlag(id('LAMP'),flag('ONBIT'),false);
    expect(selectSceneNodes(secret,queryScope(game,world).observation,[]).features).toEqual([]);
  },60000);
});

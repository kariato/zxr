import {expect,test} from '@playwright/test';
import {GameSession,loadGame,WorldState} from '../src/engine/index.ts';
import {packBundle} from '../src/zil/bundle.ts';
import {compileSourcePath} from '../tools/zil/compile.ts';

// Import a normal source checkpoint to bypass the intentionally disorienting
// Carousel puzzle during rendering coverage. All following routes use the engine.
function marbleCheckpoint(){
  const game=loadGame(packBundle(compileSourcePath('reference/zork2'))),session=new GameSession(game);session.opening();
  const save=session.exportSave(),world=WorldState.restore(game,save.checkpoint.interpreter.world);
  const id=(name:string)=>game.bundle.payload.world.entities.find(e=>e.name===name)!.id;
  const on=game.bundle.payload.symbols.symbols.find(f=>f.kind==='attribute'&&f.name==='ONBIT')!.number!;
  world.move(world.global('PLAYER'),id('MARBLE-HALL'));world.setGlobal('HERE',id('MARBLE-HALL'));world.move(id('LAMP'),world.global('PLAYER'));world.setFlag(id('LAMP'),on,true);
  save.checkpoint.interpreter.world=world.snapshot();return Buffer.from(JSON.stringify(save));
}

test('previews five ravine source rooms with one retained model and deferred upper interiors',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[],requests:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(r.url().includes('lower-ravine-v4')&&r.url().endsWith('.glb'))requests.push(r.url());});
  await page.goto('./');await page.getByRole('button',{name:'Start Zork II',exact:true}).click();
  const prototype=page.getByRole('region',{name:'3D prototype',exact:true});await expect(prototype).toBeVisible({timeout:60000});
  test.skip(await prototype.getByText('3D is unavailable in this browser.',{exact:false}).isVisible(),'WebGL unavailable; source routes covered by unit tests.');
  const lamp=prototype.locator('.prototype-objects nav').filter({has:page.getByRole('button',{name:/^Other actions:.*(?:lamp|lantern)/i})});
  await lamp.getByRole('button').first().click();await lamp.getByRole('button').first().click();
  const moves=prototype.getByRole('navigation',{name:'Movement attempts',exact:true});const walk=async(d:string)=>moves.getByRole('button',{name:new RegExp('^Go: '+d+'$','i')}).click();
  const viewport=prototype.locator('.prototype-viewport');
  const room=async(id:string)=>{await expect(viewport).toHaveAttribute('data-ravine-room',id);await expect(viewport).toHaveAttribute('data-scene-projection','orthographic');await expect(viewport).toHaveAttribute('data-ravine-scene','ready',{timeout:60000});};
  for(const d of ['south','south','south','sw','south','sw'])await walk(d);
  await room('STREAM-PATH');expect(requests).toHaveLength(1);
  if(!process.env.CI)await viewport.screenshot({path:test.info().outputPath('stream-path.png')});
  const before=await prototype.locator('.prototype-info').textContent();await prototype.getByRole('button',{name:'Ravine overview',exact:true}).click();
  await expect(prototype.locator('.prototype-info')).toHaveText(before!);if(!process.env.CI)await viewport.screenshot({path:test.info().outputPath('ravine-overview.png')});
  await prototype.getByRole('button',{name:'Recenter view',exact:true}).click();
  await walk('west');await room('STREAM-PATH');expect(requests).toHaveLength(1);
  // Crossing to the garden switches back to its own GLB and garden-only skybox.
  await walk('east');await expect(viewport).toHaveAttribute('data-garden-room','FORMAL-GARDEN');await expect(viewport).not.toHaveAttribute('data-ravine-scene','ready');
  await page.getByLabel('Import save',{exact:true}).setInputFiles({name:'marble.json',mimeType:'application/json',buffer:marbleCheckpoint()});
  await room('MARBLE-HALL');if(!process.env.CI)await viewport.screenshot({path:test.info().outputPath('marble-hall.png')});const retained=requests.length;
  await walk('north');await room('DEEP-FORD');if(!process.env.CI)await viewport.screenshot({path:test.info().outputPath('deep-ford.png')});
  await walk('east');await room('DEEP-FORD');await walk('north');await room('RAVINE-LEDGE');if(!process.env.CI)await viewport.screenshot({path:test.info().outputPath('ravine-ledge.png')});
  await walk('west');await room('LEDGE-TUNNEL');if(!process.env.CI)await viewport.screenshot({path:test.info().outputPath('end-of-ledge.png')});
  await walk('down');await room('LEDGE-TUNNEL');await walk('east');await room('RAVINE-LEDGE');expect(requests).toHaveLength(retained);
  await walk('up');await expect(viewport).not.toHaveAttribute('data-ravine-scene','ready');await expect(prototype.locator('.prototype-info')).toContainText('Tiny Room');await expect(prototype.locator('.prototype-info')).toContainText('artwork to follow');
  await walk('down');await room('RAVINE-LEDGE');
  const heldLamp=prototype.locator('.prototype-objects nav').filter({has:page.getByRole('button',{name:/^Other actions:.*(?:lamp|lantern)/i})});await heldLamp.getByRole('button',{name:/^Other actions:/}).click();
  const available=page.getByRole('region',{name:'Available choices'});
  await available.getByRole('button',{name:/More actions/}).click();
  await available.getByRole('button',{name:'Turn off: lamp',exact:true}).click();
  await expect(viewport).not.toHaveAttribute('data-ravine-scene','ready');await expect(prototype.getByRole('button',{name:'Ravine overview',exact:true})).toBeHidden();expect(errors).toEqual([]);
});

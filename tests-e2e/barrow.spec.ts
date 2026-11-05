import {expect,test} from '@playwright/test';

test('loads the modular Barrow with working movable props and source exit',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requests:string[]=[];page.on('request',r=>{if(r.url().includes('barrow-modular-v1')&&r.url().endsWith('.glb'))requests.push(r.url());});
  await page.goto('./');await page.getByRole('button',{name:'Start from the beginning',exact:true}).click();
  const prototype=page.getByRole('region',{name:'3D prototype',exact:true});
  await expect(prototype).toBeVisible({timeout:60000});
  test.skip(await prototype.getByText('3D is unavailable in this browser.',{exact:false}).isVisible(),'No WebGL available');
  const viewport=prototype.locator('.prototype-viewport');
  await expect(viewport).toHaveAttribute('data-barrow-scene','ready',{timeout:90000});
  const lamp=prototype.locator('.prototype-objects nav').filter({has:page.getByRole('button',{name:/^Other actions:.*(?:lamp|lantern)/i})});
  await lamp.getByRole('button').first().click();
  await expect(viewport).toHaveAttribute('data-barrow-scene','ready');
  expect(requests).toHaveLength(1);
  await viewport.screenshot({path:test.info().outputPath('barrow-modular.png')});
  const moves=prototype.getByRole('navigation',{name:'Movement attempts',exact:true});
  await moves.getByRole('button',{name:/^Go: south$/i}).click();
  await expect(prototype.locator('.prototype-info')).toContainText('Narrow Tunnel');
  await expect(viewport).not.toHaveAttribute('data-barrow-scene','ready');
  expect(errors).toEqual([]);
});

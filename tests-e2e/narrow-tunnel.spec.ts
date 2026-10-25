import {expect,test} from '@playwright/test';

test('loads the generated room, preserves refusal and reattaches on return',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');await page.getByRole('button',{name:'Start Zork II',exact:true}).click();
  const prototype=page.getByRole('region',{name:'3D prototype',exact:true});
  await expect(prototype).toBeVisible({timeout:60000});
  test.skip(await prototype.getByText('3D is unavailable in this browser.',{exact:false}).isVisible(),'WebGL is unavailable; text-player and source movement are checked separately.');
  const moves=prototype.getByRole('navigation',{name:'Movement attempts',exact:true});
  const walk=async(direction:string)=>moves.getByRole('button',{name:new RegExp('^Go: '+direction+'$','i')}).click();
  await walk('south');
  const viewport=prototype.locator('.prototype-viewport');
  await expect(prototype.locator('.prototype-info')).toContainText('Narrow Tunnel');
  await expect(viewport).toHaveAttribute('data-narrow-tunnel','ready',{timeout:60000});
  await walk('down');
  await expect(prototype.locator('.prototype-feedback')).toContainText('crumbling rocks');
  await expect(viewport).toHaveAttribute('data-narrow-tunnel','ready');
  await walk('south');await expect(prototype.locator('.prototype-info')).toContainText('Foot Bridge');
  await expect(viewport).not.toHaveAttribute('data-narrow-tunnel','ready');
  await walk('north');await expect(prototype.locator('.prototype-info')).toContainText('Narrow Tunnel');
  await expect(viewport).toHaveAttribute('data-narrow-tunnel','ready',{timeout:60000});
  await page.screenshot({path:test.info().outputPath('narrow-tunnel.png'),fullPage:true});
  await walk('north');await expect(prototype.locator('.prototype-info')).toContainText('Inside the Barrow');
  expect(errors).toEqual([]);
});

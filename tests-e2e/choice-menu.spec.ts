import { expect, test } from '@playwright/test';
test('eight choices fit the first page and every remaining action is one keyboard expansion away',async({page})=>{
  test.skip(process.env.GITHUB_PAGES==='true','Development presenter fixture; the player shell is phase 4.8.');
  await page.setViewportSize({width:768,height:1024});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/tests-e2e/fixtures/choice-menu.html');const menu=page.getByRole('region',{name:'Lamp actions'});
  await expect(menu.getByRole('button')).toHaveCount(9);await expect(menu.getByRole('button',{name:'Action 2',exact:true})).not.toBeVisible();
  for(const button of await menu.getByRole('button').all()){const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.y+box!.height).toBeLessThanOrEqual(1024);}
  const expand=menu.getByRole('button',{name:/^(More actions \(12\)|Fewer actions)$/});await expand.focus();await page.keyboard.press('Enter');
  await expect(expand).toHaveAttribute('aria-expanded','true');await expect(menu.getByRole('button')).toHaveCount(21);
  for(let i=1;i<=20;i++)await expect(menu.getByRole('button',{name:'Action '+i,exact:true})).toBeVisible();
  // Native keyboard order reaches the formerly gated entry immediately after expansion.
  await page.keyboard.press('Tab');await expect(menu.getByRole('button',{name:'Action 2',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByLabel('Selected action')).toHaveText('Action 2');
  await expand.focus();await page.keyboard.press('Space');await expect(expand).toHaveAttribute('aria-expanded','false');await expect(expand).toBeFocused();
  await expect(menu.getByRole('button')).toHaveCount(9);
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});

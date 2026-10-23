import { expect, test } from '@playwright/test';
test('source-generated labels are accessible plain text and preserve selected vocabulary spelling',async({page})=>{
  test.skip(process.env.GITHUB_PAGES==='true','Development labels fixture; the player shell is phase 4.8.');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/tests-e2e/fixtures/action-labels.html');const region=page.getByRole('region',{name:'Action labels'});
  await expect(region.getByRole('button')).toHaveCount(6);
  await expect(region.getByRole('button',{name:'Take: lamp',exact:true})).toBeVisible();
  await expect(region.getByRole('button',{name:'Go: west',exact:true})).toBeVisible();
  await expect(region.getByRole('button',{name:'Say: [words]',exact:true})).toBeVisible();
  await expect(region.getByRole('button',{name:/^robot — Put: .+ in .+$/})).toBeVisible();
  const selected=region.getByRole('button',{name:'Say: “w west”',exact:true});await selected.focus();await page.keyboard.press('Enter');
  await expect(page.getByLabel('Selected action')).toHaveText('Say: “w west”');
  await expect(region.getByRole('button',{name:'Take: <img src=x onerror="alert(1)">',exact:true})).toBeVisible();
  await expect(region.locator('img')).toHaveCount(0);expect(errors).toEqual([]);
});

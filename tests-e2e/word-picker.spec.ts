import { expect, test } from '@playwright/test';
test('tablet vocabulary selection needs only letter taps and preserves the selected dictionary word',async({browser,browserName})=>{
  test.skip(process.env.GITHUB_PAGES==='true','Development fixture; the player shell is phase 4.8.');
  const context=await browser.newContext({viewport:{width:768,height:1024},...(browserName==='chromium'?{hasTouch:true}:{})}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));const start=Date.now();
  try{
    await page.goto('http://127.0.0.1:4173/tests-e2e/fixtures/word-picker.html');
    const press=async(name:string)=>{const control=page.getByRole('button',{name,exact:true});if(browserName==='chromium')await control.tap();else await control.click();};
    await expect(page.getByRole('region',{name:'Vocabulary word picker'}).getByRole('status')).toContainText('689 words');
    await expect(page.locator('input, textarea')).toHaveCount(0);
    await press('Add W to filter');await press('Add E to filter');await press('well');
    const output=page.getByLabel('Selected words');await expect(output).toHaveText('well');await expect(output).toHaveAttribute('data-dictionary-index','656');
    expect(Date.now()-start).toBeLessThan(60000);
    await press('Clear filter');await press('Add W to filter');await press('w');
    await expect(output).toHaveAttribute('data-word','W');await expect(output).toHaveAttribute('data-dictionary-index','643');
    const box=await page.getByRole('button',{name:'well',exact:true}).boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath('tablet-word-picker.png'),fullPage:true});expect(errors).toEqual([]);
  }finally{await context.close();}
});

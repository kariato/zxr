import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('plays 20 turns using only keyboard shortcuts and restores an exported save',async({page})=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:768,height:1024});await page.goto('./');await expect(page.getByRole('heading',{name:'ZXR',exact:true})).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Start Zork II',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  const choices=page.getByRole('region',{name:'Available choices'});await expect(choices).toBeVisible({timeout:60000});
  for(let turn=1;turn<=20;turn++){
    await page.keyboard.press('4');await expect(choices.getByRole('heading')).toHaveText('Menu');
    await page.keyboard.press('3');await expect(choices.getByRole('heading')).toHaveText('Look');
    await page.keyboard.press('1');await expect(page.getByLabel('Game status')).toContainText('Moves: '+turn);
  }
  const transcript=page.getByRole('log',{name:'Game transcript'});await expect(transcript).toContainText('You are inside an ancient barrow');await expect(transcript.locator('.chosen-command')).toHaveCount(20);
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('text-player.png'),fullPage:true});
  await expect(page.locator('input[type=text], textarea')).toHaveCount(0);
  const beforeSize=await page.locator('.text-player').evaluate(el=>getComputedStyle(el).fontSize);await page.getByRole('button',{name:'Larger text',exact:true}).click();
  expect(await page.locator('.text-player').evaluate(el=>getComputedStyle(el).fontSize)).not.toBe(beforeSize);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export save',exact:true}).click();const download=await downloading;
  const saved=readFileSync((await download.path())!);
  await choices.getByRole('heading').focus();await page.keyboard.press('4');await page.keyboard.press('3');await page.keyboard.press('1');await expect(page.getByLabel('Game status')).toContainText('Moves: 21');
  await page.getByLabel('Import save',{exact:true}).setInputFiles({name:'save.json',mimeType:'application/json',buffer:saved});await expect(page.getByLabel('Game status')).toContainText('Moves: 20');
  await page.getByLabel('Import save',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.getByRole('status',{name:'Player messages'})).toContainText('Save import failed:');await expect(page.getByLabel('Game status')).toContainText('Moves: 20');
  expect(errors).toEqual([]);
});

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
  await expect(page.getByRole('textbox')).toHaveCount(1);await expect(page.getByRole('textbox',{name:'Checkpoint name',exact:true})).toBeVisible();
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

test('Enter finishes take sword without a source container and Escape cancels sentence construction',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:768,height:1024});await page.goto('./');await page.getByRole('button',{name:'Start Zork II',exact:true}).click();
  const choices=page.getByRole('region',{name:'Available choices'}),heading=choices.getByRole('heading').first(),status=page.getByLabel('Game status');
  await expect(heading).toHaveText('Choose an action',{timeout:60000});
  const choose=async(label:string)=>{const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),control=choices.getByRole('button',{name:new RegExp('^(?:[1-9]\\. )?'+escaped+'$')});if(!await control.isVisible()){await choices.getByRole('button',{name:/^(?:[1-9]\. )?More actions/}).click();}await control.click();};
  await choose('Objects');await page.keyboard.press('Escape');await expect(heading).toHaveText('Choose an action');await expect(status).toContainText('Moves: 0');
  await choose('Objects');await choose('elvish sword');await choose('Take elvish sword from [object]');await expect(heading).toHaveText('Take elvish sword from [object]');
  const finish=choices.getByRole('button',{name:'Finish sentence (Enter)',exact:true});await expect(finish).toBeEnabled();await expect(finish).toHaveAttribute('title','Pick up elvish sword');
  await page.getByRole('textbox',{name:'Checkpoint name',exact:true}).fill('No command from a name');await page.keyboard.press('Enter');await expect(status).toContainText('Moves: 0');
  await page.getByRole('log',{name:'Game transcript'}).focus();await page.keyboard.press('Enter');await expect(status).toContainText('Moves: 1');await expect(page.getByRole('log',{name:'Game transcript'})).toContainText('Taken.');await expect(heading).toHaveText('Choose an action');
  await choose('Actions');await choose('Put: [object] in [object]');await expect(finish).toBeDisabled();await page.keyboard.press('Enter');await expect(status).toContainText('Moves: 1');await expect(page.getByRole('status',{name:'Player messages'})).toContainText('remaining parts');
  await choose('elvish sword');await expect(heading).toHaveText('Choose wording: elvish sword');await expect(finish).toBeDisabled();await page.keyboard.press('Escape');await expect(heading).toHaveText('Choose an action');await expect(status).toContainText('Moves: 1');
  await choose('Actions');await choose('Pick up [object]');await choose('Choose multiple objects');await choose('Select: lamp');await expect(finish).toBeEnabled();await choices.getByRole('button',{name:'Cancel sentence (Esc)',exact:true}).click();await expect(heading).toHaveText('Choose an action');await expect(status).toContainText('Moves: 1');
  await choose('Actions');await choose('Say [words]');await page.getByRole('button',{name:'Add H to filter',exact:true}).click();await page.keyboard.press('Escape');await expect(heading).toHaveText('Choose an action');await expect(choices.getByRole('region',{name:'Vocabulary word picker'})).toHaveCount(0);await expect(status).toContainText('Moves: 1');
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
});

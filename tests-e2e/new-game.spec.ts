import {expect,test} from '@playwright/test';

test('starting from the beginning ignores the autosave and preserves named checkpoints',async({page})=>{
  test.setTimeout(120000);
  await page.goto('./');await page.getByRole('button',{name:'Start Zork II',exact:true}).click();
  const choices=page.getByRole('region',{name:'Available choices'});
  await expect(choices).toBeVisible({timeout:60000});
  await choices.getByRole('button',{name:'4. Menu:',exact:false}).click();
  await choices.getByRole('button',{name:'3. Look',exact:true}).click();
  await choices.getByRole('button',{name:'1. Do: Look',exact:true}).click();
  await expect(page.getByLabel('Game status')).toContainText('Moves: 1');
  await page.getByRole('textbox',{name:'Checkpoint name',exact:true}).fill('Previous adventure');
  await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();
  await expect(page.getByRole('status',{name:'Player messages'})).toHaveText('Checkpoint saved.');
  await page.reload();
  await page.screenshot({path:test.info().outputPath('startup-choices.png'),fullPage:true});
  await page.getByRole('button',{name:'Start from the beginning',exact:true}).click();
  await expect(page.getByLabel('Game status')).toHaveText('Inside the Barrow · Moves: 0',{timeout:60000});
  await expect(page.getByRole('log',{name:'Game transcript'})).toContainText('You are inside an ancient barrow');
  await expect(page.getByLabel('Saved checkpoints',{exact:true}).locator('option')).toHaveText(['Previous adventure']);
  await expect(page.getByRole('status',{name:'Player messages'})).not.toContainText('Autosave restored.');
  await page.reload();await page.getByRole('button',{name:'Start Zork II',exact:true}).click();
  await expect(page.getByLabel('Game status')).toHaveText('Inside the Barrow · Moves: 0',{timeout:60000});
  await page.getByRole('button',{name:'Load checkpoint',exact:true}).click();
  await expect(page.getByLabel('Game status')).toHaveText('Inside the Barrow · Moves: 1',{timeout:60000});
});

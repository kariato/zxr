import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
async function start(page:Page){await page.goto('./');await page.getByRole('button',{name:'Start Zork II',exact:true}).click();await expect(page.getByRole('region',{name:'Available choices'})).toBeVisible({timeout:60000});}
async function look(page:Page,moves:number){const choices=page.getByRole('region',{name:'Available choices'});await choices.getByRole('button',{name:'4. Menu:',exact:false}).click();await choices.getByRole('button',{name:'3. Look',exact:true}).click();await choices.getByRole('button',{name:'1. Do: Look',exact:true}).click();await expect(page.getByLabel('Game status')).toContainText('Moves: '+moves);await expect(page.getByRole('button',{name:'Save checkpoint',exact:true})).toBeEnabled();}
async function exported(page:Page){const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export save',exact:true}).click();return JSON.parse(readFileSync((await (await downloading).path())!,'utf8'));}
test('autosaves only accepted boundaries and recovers identical state after page reload; named slots persist separately',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:768,height:1024});await start(page);await look(page,1);
  const saved=await exported(page);await page.getByRole('textbox',{name:'Checkpoint name',exact:true}).fill('<b>before / maze</b>');await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();await expect(page.getByRole('status',{name:'Player messages'})).toHaveText('Checkpoint saved.');
  await look(page,2);const later=await exported(page);await page.reload();await page.getByRole('button',{name:'Start Zork II',exact:true}).click();await expect(page.getByRole('status',{name:'Player messages'})).toHaveText('Autosave restored.',{timeout:60000});
  const recovered=await exported(page);for(const field of ['checkpoint','knowledge','remembered'])expect(recovered[field]).toEqual(later[field]);expect(recovered.metadata.epoch).toBeGreaterThan(1);
  await expect(page.getByLabel('Saved checkpoints',{exact:true}).locator('option')).toHaveText(['<b>before / maze</b>']);
  await page.getByRole('button',{name:'Load checkpoint',exact:true}).click();await expect(page.getByLabel('Game status')).toContainText('Moves: 1',{timeout:60000});await expect(page.getByRole('button',{name:'Export save',exact:true})).toBeEnabled();
  const restored=await exported(page);for(const field of ['checkpoint','knowledge','remembered'])expect(restored[field]).toEqual(saved[field]);expect(restored.metadata.epoch).toBeGreaterThan(recovered.metadata.epoch);
  await page.getByRole('button',{name:'Delete checkpoint',exact:true}).click();await expect(page.getByLabel('Saved checkpoints',{exact:true}).locator('option')).toHaveCount(0);
  const choices=page.getByRole('region',{name:'Available choices'});await choices.getByRole('button',{name:'1. Objects',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Start Zork II',exact:true}).click();await expect(page.getByLabel('Game status')).toContainText('Moves: 1',{timeout:60000});
  await expect(choices.getByRole('heading')).toHaveText('Choose an action');expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('saved-games-tablet.png'),fullPage:true});
});
test('corrupt autosave remains recoverable through file import and is not silently overwritten at startup',async({page})=>{
  test.setTimeout(120000);await start(page);await look(page,1);const good=await exported(page);
  const key=good.buildHash+':auto';await page.evaluate(async key=>{await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('zxr',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('saves','readwrite');tx.objectStore('saves').put('{broken',key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},key);
  await page.reload();await page.getByRole('button',{name:'Start Zork II',exact:true}).click();await expect(page.getByRole('status',{name:'Player messages'})).toContainText('Autosave could not be loaded:',{timeout:60000});await expect(page.getByLabel('Game status')).toContainText('Moves: 0');
  const stored=await page.evaluate(async key=>await new Promise(resolve=>{const r=indexedDB.open('zxr',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('saves');const get=tx.objectStore('saves').get(key);get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close();};}),key);expect(stored).toBe('{broken');
  await page.getByLabel('Import save',{exact:true}).setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(good))});await expect(page.getByLabel('Game status')).toContainText('Moves: 1',{timeout:60000});await expect(page.getByRole('button',{name:'Save checkpoint',exact:true})).toBeEnabled();
  await page.reload();await page.getByRole('button',{name:'Start Zork II',exact:true}).click();await expect(page.getByRole('status',{name:'Player messages'})).toHaveText('Autosave restored.',{timeout:60000});await expect(page.getByLabel('Game status')).toContainText('Moves: 1',{timeout:60000});
});
test('IndexedDB waits for transaction commit, rejects aborts, and continues the write queue',async({page})=>{
  test.skip(process.env.GITHUB_PAGES==='true','Development storage transaction fixture.');
  await page.goto('/tests-e2e/fixtures/storage.html');await page.getByRole('button',{name:'Run transaction checks'}).click();const output=page.locator('output');await expect(output).toContainText('acknowledged');
  expect(JSON.parse((await output.textContent())!)).toEqual({aborted:true,missing:null,acknowledged:true,value:'good',keys:['test:committed'],deleted:null});
});
async function special(page:Page,label:string){
  const choices=page.getByRole('region',{name:'Available choices'});await choices.getByRole('button',{name:/^2\. Actions$/}).click();
  const target=choices.getByRole('button',{name:new RegExp('^(?:\\d+\\. )?'+label+'$')});if(!await target.count())await choices.getByRole('button',{name:/More actions/}).click();
  await target.click();await choices.getByRole('button',{name:new RegExp('^1\\. Do: '+label+'$')}).click();
}
async function record(page:Page,key:string){return page.evaluate(async key=>await new Promise<string|undefined>((resolve,reject)=>{const r=indexedDB.open('zxr',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('saves');const get=tx.objectStore('saves').get(key);get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};}),key);}
test('source SAVE/RESTORE uses its own continuation and pending or terminal decisions leave the last autosave intact',async({page})=>{
  test.setTimeout(120000);await start(page);const choices=page.getByRole('region',{name:'Available choices'});
  await choices.getByRole('button',{name:/^4\. Menu:/}).click();await choices.getByRole('button',{name:/^\d+\. Save$/}).click();await choices.getByRole('button',{name:/^1\. Do: Save$/}).click();await expect(page.getByRole('button',{name:'Export save',exact:true})).toBeEnabled();
  const saved=await exported(page);const source=JSON.parse((await record(page,saved.buildHash+':source'))!);expect(source.kind).toBe('primitive-save');expect(saved.kind).toBe('boundary');
  await look(page,1);await special(page,'Restore');await expect(page.getByRole('button',{name:'Export save',exact:true})).toBeEnabled();
  const restored=await exported(page);for(const field of ['checkpoint','knowledge','remembered'])expect(restored[field]).toEqual(saved[field]);
  const autoKey=saved.buildHash+':auto',before=await record(page,autoKey);await special(page,'Quit');await expect(choices.getByRole('heading')).toHaveText('Choose a response');expect(await record(page,autoKey)).toBe(before);
  await choices.getByRole('button',{name:'1. Yes',exact:true}).click();await expect(choices.getByRole('heading')).toHaveText('Game ended');expect(await record(page,autoKey)).toBe(before);
});
test('unavailable storage leaves the player and portable save files usable',async({page})=>{
  test.setTimeout(120000);await page.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{get:()=>{throw new DOMException('Blocked','SecurityError');}}));await start(page);
  await expect(page.getByRole('status',{name:'Player messages'})).toContainText('IndexedDB is unavailable');await look(page,1);await expect(page.getByRole('status',{name:'Player messages'})).toContainText('Autosave failed:');
  const saved=await exported(page);await look(page,2);await page.getByLabel('Import save',{exact:true}).setInputFiles({name:'portable.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.getByLabel('Game status')).toContainText('Moves: 1',{timeout:60000});
});

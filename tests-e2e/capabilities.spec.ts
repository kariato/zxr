import { expect,test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { capabilityManifest } from '../src/engine/capabilities.ts';

test('capability panel matches the manifest and browsing leaves the game and draft unchanged',async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width:768,height:1024});await page.goto('./');
  await page.getByRole('button',{name:'Start Zork II',exact:true}).click();
  const choices=page.getByRole('region',{name:'Available choices'});
  await expect(choices.getByRole('heading')).toHaveText('Choose an action',{timeout:60000});
  const exportSave=async()=>{const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Export save',exact:true}).click();const download=await waiting;return readFileSync((await download.path())!,'utf8');};
  const before=await exportSave();
  await choices.getByRole('button',{name:/^(?:[1-9]\. )?Objects$/}).click();
  const draft=await choices.innerText(),transcript=await page.getByRole('log',{name:'Game transcript'}).innerText();
  const panel=page.locator('[data-capabilities]'),toggle=panel.locator('summary');
  await toggle.focus();await page.keyboard.press('Enter');await expect(panel).toHaveAttribute('open','');
  const manifest=capabilityManifest();await expect(panel.locator('dt')).toHaveCount(manifest.entries.length);
  for(const entry of manifest.entries){await expect(panel.locator('dt').filter({hasText:entry.name+' — '+entry.status})).toBeVisible();await expect(panel).toContainText(entry.detail);}
  await expect(panel).toContainText(/Build: [a-f0-9]{64}/);
  // Panel keyboard use must not operate the live draft through global shortcuts.
  await page.keyboard.press('1');await page.keyboard.press('Escape');expect(await choices.innerText()).toBe(draft);
  expect(await page.getByRole('log',{name:'Game transcript'}).innerText()).toBe(transcript);
  expect(await exportSave()).toBe(before);await expect(page.getByLabel('Game status')).toContainText('Moves: 0');
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('capabilities-tablet.png'),fullPage:true});
  await toggle.click();await expect(panel).not.toHaveAttribute('open','');expect(await choices.innerText()).toBe(draft);
});

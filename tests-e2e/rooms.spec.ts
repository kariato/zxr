import { test, expect } from '@playwright/test';

test('published room browser loads models and changes rooms', async ({ page }) => {
  test.skip(process.env.GITHUB_PAGES !== 'true', 'Room packages are emitted by the production build.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('rooms/');
  await expect(page.locator('#rooms option')).toHaveCount(86, { timeout: 30000 });
  const unavailable = await page.locator('#stage').getAttribute('data-webgl') === 'unavailable';
  const ready = unavailable ? 'unavailable' : 'true';
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', ready, { timeout: 30000 });
  await expect(page.locator('#status')).toContainText('Inside the Barrow');
  await page.locator('#rooms').selectOption('AQUARIUM-ROOM');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', ready, { timeout: 30000 });
  await expect(page.locator('#status')).toContainText('Aquarium Room');
  await expect(page.locator('#download')).toHaveAttribute('href', /models\/aquarium-room\/room.glb$/);
  await page.locator('#reset').click();
  await page.screenshot({ path: 'out/rooms-browser.png' });
  expect(errors).toEqual([]);
});


test('room downloads remain available without WebGL', async ({ page }) => {
  test.skip(process.env.GITHUB_PAGES !== 'true', 'Production room packages required.');
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if(type.includes('webgl')) return null;
      return getContext.apply(this, [type, ...args] as Parameters<typeof getContext>);
    } as typeof getContext;
  });
  await page.goto('rooms/');
  await expect(page.locator('#rooms option')).toHaveCount(86);
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'unavailable');
  await page.locator('#rooms').selectOption('AQUARIUM-ROOM');
  await expect(page.locator('#status')).toContainText('3D is unavailable');
  await expect(page.locator('#download')).toHaveAttribute('href', /models\/aquarium-room\/room.glb$/);
});

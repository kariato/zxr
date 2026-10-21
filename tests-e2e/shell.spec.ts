import { expect, test } from '@playwright/test';

test('the phase 0 shell loads and has a keyboard-accessible project link', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'ZXR', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('not playable yet');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(16, 42, 39)');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Follow the project' })).toBeFocused();
  expect(errors).toEqual([]);
});

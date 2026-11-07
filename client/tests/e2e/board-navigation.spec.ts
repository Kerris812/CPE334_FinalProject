import { expect, test } from '@playwright/test';

test('public board Back is keyboard accessible and returns to the in-app source', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'View public board' }).click();
  await expect(page).toHaveURL(/\/board$/);
  const back = page.getByRole('button', { name: 'Back', exact: true });
  await expect(back).toBeEnabled();
  await back.focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(back).toBeFocused();
  expect(await back.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await back.press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
for (const [role, fallback] of [['OPERATOR', '/operator/desk'], ['CUSTOMER', '/my-queue'], [null, '/login']] as const) {
  test(`direct public board Back uses ${role ?? 'anonymous'} fallback`, async ({ page }) => {
    await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { data: { user: role ? { id: 'navigation-test', displayName: 'Navigation account', role } : null } } }));
    await page.route('**/api/v1/operator/queues', route => route.fulfill({ json: { data: [] } }));
    await page.route('**/api/v1/customer/entries/latest', route => route.fulfill({ json: { data: null } }));
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/board');
    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await back.click(); await expect(page).toHaveURL(new RegExp(`${fallback}$`));
    if (role === 'CUSTOMER') {
      for (const width of [360, 768, 1440]) {
        await page.setViewportSize({ width, height: 780 });
        const identity = (await page.locator('.customer-user-chip').boundingBox())!;
        const boardLink = (await page.getByRole('link', { name: 'View public board' }).boundingBox())!;
        const logout = (await page.getByRole('button', { name: 'Log out' }).boundingBox())!;
        expect(identity.y).toBeLessThan(boardLink.y);
        expect(identity.x + identity.width).toBeGreaterThanOrEqual(logout.x + logout.width);
        await expect(page.locator('.customer-user-role')).toHaveText('CUSTOMER');
        await expect(page.locator('h1')).toHaveText('My queue');
        await expect(page.getByRole('link', { name: 'View public board' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(page.getByRole('button', { name: 'Log out' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(page.getByText('Queue and service management', { exact: true })).toHaveCount(0);
        expect(logout.y).toBeLessThan(boardLink.y);
        await expect(page.locator('.app-header')).toContainText('Restaurant Queue');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `/tmp/cpe334-account-header-${width}.png`, fullPage: true });
      }
    }
  });
}

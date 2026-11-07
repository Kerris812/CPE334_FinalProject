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
  });
}

import { expect, test } from '@playwright/test';
test('foundation loads and Vite proxies the real health endpoint', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Restaurant Queue' })).toBeVisible();
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', service: 'restaurant-queue-api' });
});

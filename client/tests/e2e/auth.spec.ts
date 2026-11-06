import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
// Read ignored local seed values without recording them in runner output or traces.
function secret(key: string) {
  if (process.env[key]) return process.env[key]!;
  const line = readFileSync('../server/.env', 'utf8').split('\n').find(value => value.startsWith(`${key}=`));
  if (!line) throw new Error('Synthetic local seed configuration is required.');
  return line.slice(key.length + 1);
}
for (const [role, email, key, path] of [
  ['customer', 'customer.a@example.test', 'DEMO_CUSTOMER_PASSWORD', '/queues'],
  ['operator', 'operator.a@example.test', 'DEMO_OPERATOR_PASSWORD', '/operator/desk'],
]) {
  test(`TEST-001 ${role} real login, reload identity and logout`, async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(secret(key));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    const cookies = await context.cookies();
    const session = cookies.find(cookie => cookie.name === 'qs_session');
    expect(Boolean(session?.httpOnly && session.sameSite === 'Lax')).toBe(true);
    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).data.user.role).toBe(role.toUpperCase());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  });
}

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const local = Object.fromEntries(readFileSync('../server/.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL, process.env.DATABASE_URL ?? local.DATABASE_URL) });
let customer: { id: string; email: string };
let queue: { id: string; code: string };
test.beforeEach(async () => {
  const seeded = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  customer = await db.user.create({ data: { email: `status-${randomUUID()}@example.test`, displayName: 'Status fixture customer', role: 'CUSTOMER', passwordHash: seeded.passwordHash } });
  queue = await db.queue.create({ data: { code: `S${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`, name: 'Private status fixture' } });
});
test.afterEach(async () => {
  if (customer) {
    await db.queueEvent.deleteMany({ where: { entry: { customerId: customer.id } } });
    await db.queueEntry.deleteMany({ where: { customerId: customer.id } });
    await db.session.deleteMany({ where: { userId: customer.id } });
    await db.user.delete({ where: { id: customer.id } });
  }
  if (queue) await db.queue.delete({ where: { id: queue.id } });
});
test.afterAll(() => db.$disconnect());

test('TEST-030 360px private status supports loading, empty, retry, all persisted stages and reload', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/login');
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_CUSTOMER_PASSWORD ?? local.DEMO_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Party size')).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/customer/entries/latest', async route => { await gate; await route.continue(); });
  await page.goto('/my-queue');
  await expect(page.getByText('Loading queue information…')).toBeVisible();
  release();
  await expect(page.getByText('You have no queue entry.')).toBeVisible();
  await page.unroute('**/api/v1/customer/entries/latest');
  await page.route('**/api/v1/customer/entries/latest', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.unroute('**/api/v1/customer/entries/latest');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('You have no queue entry.')).toBeVisible();

  // Deterministic DB fixtures; these do not claim operator workflow coverage.
  const historical = await db.queueEntry.create({ data: { customerId: customer.id, queueId: queue.id, sequence: 1n, displayNumber: `${queue.code}-0001`, partySize: 2, status: 'COMPLETED', joinedAt: new Date('2026-11-05T08:00:00Z'), completedAt: new Date('2026-11-05T09:00:00Z') } });
  const saved = await db.queueEntry.create({ data: { customerId: customer.id, queueId: queue.id, sequence: 10000n, displayNumber: `${queue.code}-10000`, partySize: 4, joinedAt: new Date('2026-11-06T08:00:00Z') } });
  for (const status of ['WAITING', 'CALLED', 'SERVING', 'COMPLETED'] as const) {
    await db.queueEntry.update({ where: { id: saved.id }, data: { status,
      calledAt: status === 'WAITING' ? null : new Date('2026-11-06T08:05:00Z'),
      servingAt: ['SERVING', 'COMPLETED'].includes(status) ? new Date('2026-11-06T08:10:00Z') : null,
      completedAt: status === 'COMPLETED' ? new Date('2026-11-06T09:00:00Z') : null,
    } });
    await page.getByRole('button', { name: 'Refresh status' }).click();
    await expect(page.getByText(saved.displayNumber, { exact: true })).toBeVisible();
    await expect(page.getByText(status, { exact: true })).toBeVisible();
    await expect(page.getByText('Party size: 4')).toBeVisible();
    await page.reload();
    await expect(page.getByText(saved.displayNumber, { exact: true })).toBeVisible();
    await expect(page.getByText(status, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const historicalRead = await page.request.get(`/api/v1/customer/entries/${historical.id}`);
  expect(historicalRead.status()).toBe(200);
  expect((await historicalRead.json()).data.status).toBe('COMPLETED');
  await page.getByRole('button', { name: 'Refresh status' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();
});

test('TEST-030 a revoked private session returns the status page to login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_CUSTOMER_PASSWORD ?? local.DEMO_CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Party size')).toBeVisible();
  await page.goto('/my-queue');
  await expect(page.getByText('You have no queue entry.')).toBeVisible();
  await db.session.updateMany({ where: { userId: customer.id }, data: { revokedAt: new Date() } });
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const local = Object.fromEntries(readFileSync('../server/.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL, process.env.DATABASE_URL ?? local.DATABASE_URL) });
let savedQueue: { lastSequence: bigint; state: 'OPEN' | 'PAUSED' | 'CLOSED' };
let customer: { id: string; email: string }; let queue: { id: string; code: string };
test.beforeEach(async () => {
  const seeded = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  customer = await db.user.create({ data: { email: `browser-${randomUUID()}@example.test`, displayName: 'Browser Customer', role: 'CUSTOMER', passwordHash: seeded.passwordHash } });
  queue = await db.queue.findUniqueOrThrow({ where: { code: 'R' } });
  savedQueue = await db.queue.findUniqueOrThrow({ where: { id: queue.id } });
});
test.afterEach(async () => {
  if (customer) {
    await db.queueEvent.deleteMany({ where: { entry: { customerId: customer.id } } }); await db.queueEntry.deleteMany({ where: { customerId: customer.id } }); await db.session.deleteMany({ where: { userId: customer.id } }); await db.user.delete({ where: { id: customer.id } });
  }
  if (queue && savedQueue) await db.queue.update({ where: { id: queue.id }, data: { lastSequence: savedQueue.lastSequence, state: savedQueue.state } });
});
test.afterAll(() => db.$disconnect());
test('TEST-030 mobile empty, slow/error states, join and persisted my-queue reload', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 }); await page.goto('/login');
  await page.getByLabel('Email').fill(customer.email); await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_CUSTOMER_PASSWORD ?? local.DEMO_CUSTOMER_PASSWORD); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Party size')).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/customer/entries/latest', async route => { await gate; await route.continue(); });
  await page.goto('/my-queue'); await expect(page.getByText('Loading queue information…')).toBeVisible();
  release(); await expect(page.getByText('You have no queue entry.')).toBeVisible(); await page.unroute('**/api/v1/customer/entries/latest');
  await page.route('**/api/v1/customer/entries/latest', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }) }));
  await page.reload(); await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible(); await page.unroute('**/api/v1/customer/entries/latest');
  await page.getByRole('button', { name: 'Retry' }).click(); await expect(page.getByText('You have no queue entry.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to queues' }).click(); await expect(page.getByText('Queue R · OPEN', { exact: true })).toBeVisible();
  await page.getByLabel('Party size').fill('0'); await page.getByRole('button', { name: 'Join queue' }).click(); await expect(page.getByText('Must be an integer from 1 to 8.')).toBeVisible();
  await page.getByLabel('Party size').fill('4'); await page.getByLabel('Party size').press('Enter'); await expect(page.getByText(`${queue.code}-0001`, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View my queue' }).click(); await page.reload(); await expect(page.getByText(`${queue.code}-0001`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const entry = await db.queueEntry.findFirstOrThrow({ where: { customerId: customer.id } }); expect(await db.queueEvent.count({ where: { entryId: entry.id, eventType: 'JOINED', actorId: customer.id } })).toBe(1);
  await page.screenshot({ path: '../artifacts/evidence/f05-routing/customer-regression-my-queue-mobile.png', fullPage: true });
});
test('anonymous public board renders only fixture public values without login', async ({ page }) => {
  await db.queueEntry.create({ data: { customerId: customer.id, queueId: queue.id, sequence: 10000n, displayNumber: `${queue.code}-10000`, partySize: 4, status: 'CALLED' } });
  await page.setViewportSize({ width: 360, height: 780 }); await page.goto(`/board/${queue.id}`);
  await expect(page.getByText(`${queue.code}-10000`, { exact: true })).toBeVisible(); await expect(page.getByText('CALLED', { exact: true })).toBeVisible(); expect(await page.getByLabel('Password').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../artifacts/evidence/f05-routing/customer-regression-public-board-mobile.png', fullPage: true });
});

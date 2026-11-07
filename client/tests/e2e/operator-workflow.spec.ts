import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const local = Object.fromEntries(readFileSync('../server/.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL, process.env.DATABASE_URL ?? local.DATABASE_URL) });
let operator: { id: string; email: string };
let savedQueue: { lastSequence: bigint; state: 'OPEN' | 'PAUSED' | 'CLOSED' };
let customer: { id: string; email: string }; let queue: { id: string; code: string };
test.beforeEach(async () => {
  const seeded = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  customer = await db.user.create({ data: { email: `browser-${randomUUID()}@example.test`, displayName: 'Browser Customer', role: 'CUSTOMER', passwordHash: seeded.passwordHash } });
  const host = await db.user.findUniqueOrThrow({ where: { email: 'operator.a@example.test' } });
  operator = await db.user.create({ data: { email: `host-${randomUUID()}@example.test`, displayName: 'Browser Host', role: 'OPERATOR', passwordHash: host.passwordHash } });
  queue = await db.queue.findUniqueOrThrow({ where: { code: 'R' } });
  savedQueue = await db.queue.findUniqueOrThrow({ where: { id: queue.id } });
  await db.operatorQueueAssignment.create({ data: { operatorId: operator.id, queueId: queue.id } });
});
test.afterEach(async () => {
  if (customer) {
    await db.queueEvent.deleteMany({ where: { entry: { customerId: customer.id } } }); await db.queueEntry.deleteMany({ where: { customerId: customer.id } }); await db.session.deleteMany({ where: { userId: customer.id } }); await db.user.delete({ where: { id: customer.id } });
  }
  if (operator) { await db.operatorQueueAssignment.deleteMany({ where: { operatorId: operator.id } }); await db.session.deleteMany({ where: { userId: operator.id } }); await db.user.delete({ where: { id: operator.id } }); }
  if (queue && savedQueue) await db.queue.update({ where: { id: queue.id }, data: { lastSequence: savedQueue.lastSequence, state: savedQueue.state } });
});
test.afterAll(() => db.$disconnect());
test('TEST-043 real customer and operator workflow reflects on my-queue and public board', async ({ page, browser }) => {
  async function login(target: typeof page, email: string, password: string) { await target.goto('/login'); await target.getByLabel('Email').fill(email); await target.getByLabel('Password', { exact: true }).fill(password); await target.getByRole('button', { name: 'Sign in', exact: true }).click(); }
  await login(page, customer.email, process.env.DEMO_CUSTOMER_PASSWORD ?? local.DEMO_CUSTOMER_PASSWORD);
  await expect(page.getByText('Queue R · OPEN', { exact: true })).toBeVisible(); await page.getByLabel('Party size').fill('4'); await page.getByRole('button', { name: 'Join queue' }).click(); await page.getByRole('link', { name: 'View my queue' }).click(); await expect(page.getByText('WAITING', { exact: true })).toBeVisible();
  const hostContext = await browser.newContext(); const boardContext = await browser.newContext();
  try {
    const host = await hostContext.newPage(); const board = await boardContext.newPage();
    await host.setViewportSize({ width: 1440, height: 1000 }); await login(host, operator.email, process.env.DEMO_OPERATOR_PASSWORD ?? local.DEMO_OPERATOR_PASSWORD);
    await expect(host.getByLabel('Assigned queue')).toBeVisible(); await host.getByLabel('Assigned queue').selectOption(queue.id);
    await host.getByRole('button', { name: 'Call Next', exact: true }).click(); await expect(host.getByText('CALLED', { exact: true })).toBeVisible();
    await board.goto(`/board/${queue.id}`); await expect(board.getByText(`${queue.code}-0001`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(page.getByText('CALLED', { exact: true })).toBeVisible();
    await host.screenshot({ path: '../artifacts/evidence/f05-routing/workflow-regression-desk-desktop.png', fullPage: true });
    await host.getByRole('button', { name: 'Start Service', exact: true }).click(); await expect(host.getByText('SERVING', { exact: true })).toBeVisible();
    await board.reload(); await expect(board.getByText('SERVING', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(page.getByText('SERVING', { exact: true })).toBeVisible();
    await host.setViewportSize({ width: 360, height: 780 }); expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.screenshot({ path: '../artifacts/evidence/f05-routing/workflow-regression-desk-mobile.png', fullPage: true });
    await host.getByRole('button', { name: 'Complete Service', exact: true }).click(); await expect(host.getByText('Service completed.')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible(); await page.reload(); await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();
    await board.reload(); await expect(board.getByText('No one called', { exact: true })).toBeVisible();
    const response = await board.request.get(`/api/v1/public/queues/${queue.id}/board`); expect(Object.keys((await response.json()).data).sort()).toEqual(['calledNumber', 'queueCode', 'serviceState', 'waitingCount']);
    const entry = await db.queueEntry.findFirstOrThrow({ where: { customerId: customer.id } }); expect(entry.status).toBe('COMPLETED'); expect(await db.queueEvent.count({ where: { entryId: entry.id } })).toBe(4);
  } finally { await hostContext.close(); await boardContext.close(); }
});

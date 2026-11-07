import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const local = Object.fromEntries(readFileSync('../server/.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL, process.env.DATABASE_URL ?? local.DATABASE_URL) });
test.afterAll(() => db.$disconnect());
test('TEST-057 both assigned operators independently complete real R/S workflows', async ({ browser }) => {
  const queues = await db.queue.findMany({ where: { code: { in: ['R', 'S'] } }, orderBy: { code: 'asc' } }); expect(queues.map(q => q.code)).toEqual(['R', 'S']);
  const customers: { id: string; email: string }[] = []; const sessions: string[] = []; const contexts = [];
  async function login(page: Page, email: string, password: string) { await page.goto('/login'); await page.getByLabel('Email').fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible(); const token = (await page.context().cookies()).find(c => c.name === 'qs_session')!.value; const row = await db.session.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } }); sessions.push(row.id); }
  try {
    const hash = (await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } })).passwordHash;
    const guests: Page[] = []; const hosts: Page[] = [];
    for (const [i, queue] of queues.entries()) {
      const customer = await db.user.create({ data: { email: `route-browser-${randomUUID()}@example.test`, displayName: 'Routing guest', role: 'CUSTOMER', passwordHash: hash } }); customers.push(customer);
      const guestContext = await browser.newContext(); contexts.push(guestContext); const guest = await guestContext.newPage(); guests.push(guest);
      await guest.setViewportSize({ width: 360, height: 780 }); await login(guest, customer.email, process.env.DEMO_CUSTOMER_PASSWORD ?? local.DEMO_CUSTOMER_PASSWORD);
      await expect(guest.getByText('Parties of 1–4 use Queue R; parties of 5–8 use Queue S.')).toBeVisible(); await guest.getByLabel('Party size').fill(i === 0 ? '4' : '5'); await expect(guest.getByText(`Queue ${queue.code} · OPEN`, { exact: true })).toBeVisible(); await guest.getByRole('button', { name: 'Join queue', exact: true }).click(); await guest.getByRole('link', { name: 'View my queue' }).click(); await expect(guest.getByText('WAITING', { exact: true })).toBeVisible();
      const hostContext = await browser.newContext(); contexts.push(hostContext); const host = await hostContext.newPage(); hosts.push(host); await host.setViewportSize({ width: i === 0 ? 1440 : 360, height: 900 });
      await login(host, `operator.${i === 0 ? 'a' : 'b'}@example.test`, process.env.DEMO_OPERATOR_PASSWORD ?? local.DEMO_OPERATOR_PASSWORD); await expect(host.getByLabel('Assigned queue').locator('option')).toHaveCount(1); await expect(host.getByLabel('Assigned queue').locator('option')).toContainText(queue.code); await expect(host.getByText('Active: 0/1')).toBeVisible();
    }
    await Promise.all(hosts.map(host => host.getByRole('button', { name: 'Call Next', exact: true }).click()));
    const boardContext = await browser.newContext(); contexts.push(boardContext); const board = await boardContext.newPage(); await board.goto('/board');
    for (const [i, queue] of queues.entries()) { const number = `${queue.code}-${String(Number(queue.lastSequence) + 1).padStart(4, '0')}`; await expect(hosts[i].getByText('CALLED', { exact: true })).toBeVisible(); await expect(hosts[i].getByText('Active: 1/1')).toBeVisible(); await expect(board.getByText(number, { exact: true })).toBeVisible(); }
    await board.screenshot({ path: '../artifacts/evidence/f05-routing/boards-desktop.png', fullPage: true });
    await Promise.all(hosts.map(host => host.getByRole('button', { name: 'Start Service', exact: true }).click()));
    for (const [i, host] of hosts.entries()) { await expect(host.getByText('SERVING', { exact: true })).toBeVisible(); expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await host.screenshot({ path: `../artifacts/evidence/f05-routing/operator-${i === 0 ? 'a-desktop' : 'b-mobile'}.png`, fullPage: true }); }
    await Promise.all(hosts.map(host => host.getByRole('button', { name: 'Complete Service', exact: true }).click()));
    for (const [i, guest] of guests.entries()) { await guest.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(guest.getByText('COMPLETED', { exact: true })).toBeVisible(); await guest.reload(); await expect(guest.getByText('COMPLETED', { exact: true })).toBeVisible(); const entry = await db.queueEntry.findFirstOrThrow({ where: { customerId: customers[i].id } }); const events = await db.queueEvent.findMany({ where: { entryId: entry.id }, orderBy: { occurredAt: 'asc' } }); expect(events.map(e => e.eventType)).toEqual(['JOINED', 'CALLED', 'STARTED', 'COMPLETED']); }
    await board.reload(); await expect(board.getByText('No one is being called yet', { exact: true })).toHaveCount(2); await board.setViewportSize({ width: 360, height: 780 }); expect(await board.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await board.screenshot({ path: '../artifacts/evidence/f05-routing/boards-mobile.png', fullPage: true });
    for (const queue of queues) { const response = await board.request.get(`/api/v1/public/queues/${queue.code}/board`); expect(response.status()).toBe(200); expect(Object.keys((await response.json()).data).sort()).toEqual(['calledNumber', 'queueCode', 'serviceState', 'waitingCount']); }
  } finally {
    for (const context of contexts) await context.close(); const ids = customers.map(c => c.id);
    await db.queueEvent.deleteMany({ where: { entry: { customerId: { in: ids } } } }); await db.queueEntry.deleteMany({ where: { customerId: { in: ids } } }); await db.session.deleteMany({ where: { OR: [{ userId: { in: ids } }, { id: { in: sessions } }] } }); await db.user.deleteMany({ where: { id: { in: ids } } });
    for (const queue of queues) await db.queue.update({ where: { id: queue.id }, data: { lastSequence: queue.lastSequence, state: queue.state } });
  }
});

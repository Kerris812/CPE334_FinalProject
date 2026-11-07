import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const local = Object.fromEntries(readFileSync('../server/.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL, process.env.DATABASE_URL ?? local.DATABASE_URL) });
const customerPassword = process.env.DEMO_CUSTOMER_PASSWORD ?? local.DEMO_CUSTOMER_PASSWORD;
const operatorPassword = process.env.DEMO_OPERATOR_PASSWORD ?? local.DEMO_OPERATOR_PASSWORD;
const evidence = '../artifacts/evidence/sprint1';
test.afterAll(() => db.$disconnect());
function publicShape(body: unknown) {
  const paths: string[] = [];
  function visit(value: unknown, prefix = '') { if (value !== null && typeof value === 'object') { expect(Array.isArray(value)).toBe(false); for (const [key, child] of Object.entries(value)) { const path = prefix ? `${prefix}.${key}` : key; paths.push(path); visit(child, path); } } }
  visit(body); expect(paths.sort()).toEqual(['data', 'data.calledNumber', 'data.queueCode', 'data.serviceState', 'data.waitingCount'].sort());
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.getByRole('button').all()) {
    if (await button.isVisible()) { const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
  }
}
test('TEST-043 complete seeded R-0001 release journey with five isolated browser identities', async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  const queue = await db.queue.findUniqueOrThrow({ where: { code: 'R' } });
  // Never reset a live queue to manufacture R-0001. Require the clean verification fixture.
  expect(queue.lastSequence).toBe(0n); expect(await db.queueEntry.count()).toBe(0);
  const a = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  const operatorA = await db.user.findUniqueOrThrow({ where: { email: 'operator.a@example.test' } });
  const contexts: BrowserContext[] = []; const sessions: string[] = [];
  let entryId: string | undefined;
  async function page(width: number) { const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 } }); contexts.push(context); return context.newPage(); }
  async function login(target: Page, email: string, password: string) {
    await target.goto('/login'); await target.getByLabel('Email').fill(email); await target.getByLabel('Password', { exact: true }).fill(password); await target.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(target.getByRole('button', { name: 'Log out' })).toBeVisible();
    const token = (await target.context().cookies()).find(row => row.name === 'qs_session')!.value;
    const session = await db.session.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } }); sessions.push(session.id);
  }
  const origin = new URL(baseURL!).origin;
  try {
    const customer = await page(360); const host = await page(1440); const board = await page(1440); const otherCustomer = await page(360); const otherOperator = await page(1440);
    await customer.goto('/login'); await expect(customer.getByLabel('Email')).toBeVisible(); await customer.screenshot({ path: `${evidence}/login-mobile.png`, fullPage: true });
    await login(customer, a.email, customerPassword); expect((await (await customer.request.get('/api/v1/auth/me')).json()).data.user.id).toBe(a.id);
    await customer.getByLabel('Party size').fill('4'); await expect(customer.getByText('Queue R · OPEN', { exact: true })).toBeVisible();
    await customer.screenshot({ path: `${evidence}/join-mobile.png`, fullPage: true });
    const joining = customer.waitForResponse(response => response.url().endsWith(`/queues/${queue.id}/entries`) && response.request().method() === 'POST');
    await customer.getByRole('button', { name: 'Join queue', exact: true }).click(); const joined = await joining; expect(joined.status()).toBe(201); const saved = (await joined.json()).data; entryId = saved.id; expect(saved.displayNumber).toBe('R-0001');
    await expect(customer.getByText('R-0001', { exact: true })).toBeVisible();
    const duplicate = await customer.request.post(`/api/v1/queues/${queue.id}/entries`, { headers: { Origin: origin }, data: { partySize: 4 } }); const duplicateBody = await duplicate.json(); expect(duplicate.status()).toBe(409); expect(duplicateBody.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');
    await customer.getByRole('link', { name: 'View my queue' }).click(); await expect(customer.getByText('WAITING', { exact: true })).toBeVisible();
    await login(host, operatorA.email, operatorPassword); await expect(host.getByLabel('Assigned queue').locator('option')).toHaveCount(1); await expect(host.getByLabel('Assigned queue').locator('option')).toContainText('R');
    await host.getByRole('button', { name: 'Call Next', exact: true }).click(); await expect(host.getByText('CALLED', { exact: true })).toBeVisible();
    await customer.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(customer.getByText('CALLED', { exact: true })).toBeVisible();
    await board.goto('/board/R'); await expect(board.getByText('R-0001', { exact: true })).toBeVisible();
    await host.screenshot({ path: `${evidence}/operator-called-desktop.png`, fullPage: true });
    await host.getByRole('button', { name: 'Start Service', exact: true }).click(); await expect(host.getByText('SERVING', { exact: true })).toBeVisible();
    await customer.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(customer.getByText('SERVING', { exact: true })).toBeVisible();
    await board.getByRole('button', { name: 'Refresh' }).click(); await expect(board.getByText('SERVING', { exact: true })).toBeVisible();
    await board.screenshot({ path: `${evidence}/public-serving-desktop.png`, fullPage: true });
    for (const width of [360, 768, 1440]) { await host.setViewportSize({ width, height: 1000 }); await fits(host); await board.setViewportSize({ width, height: 1000 }); await fits(board); }
    await host.setViewportSize({ width: 360, height: 1000 }); await host.screenshot({ path: `${evidence}/operator-serving-mobile.png`, fullPage: true });
    await board.setViewportSize({ width: 360, height: 1000 }); await board.screenshot({ path: `${evidence}/public-serving-mobile.png`, fullPage: true });
    await host.getByRole('button', { name: 'Complete Service', exact: true }).click(); await expect(host.getByText('Service completed.')).toBeVisible();
    await customer.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(customer.getByText('COMPLETED', { exact: true })).toBeVisible(); await customer.reload(); await expect(customer.getByText('COMPLETED', { exact: true })).toBeVisible(); await fits(customer);
    await customer.screenshot({ path: `${evidence}/customer-completed-mobile.png`, fullPage: true });
    const boardResponse = await board.request.get('/api/v1/public/queues/R/board'); expect(boardResponse.status()).toBe(200); const publicBody = await boardResponse.json(); publicShape(publicBody); expect(publicBody.data).toEqual({ queueCode: 'R', calledNumber: null, serviceState: null, waitingCount: 0 });
    expect((await board.context().cookies()).some(cookie => cookie.name === 'qs_session')).toBe(false); await expect(board.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    await login(otherCustomer, 'customer.b@example.test', customerPassword); const foreign = await otherCustomer.request.get(`/api/v1/customer/entries/${entryId}`); const foreignBody = await foreign.json(); expect(foreign.status()).toBe(404); expect(foreignBody.error.code).toBe('ENTRY_NOT_FOUND');
    const before = await db.queueEntry.findUniqueOrThrow({ where: { id: entryId } }); const beforeEvents = await db.queueEvent.findMany({ where: { entryId }, orderBy: { occurredAt: 'asc' } });
    await login(otherOperator, 'operator.b@example.test', operatorPassword); await expect(otherOperator.getByLabel('Assigned queue').locator('option')).toContainText('S');
    expect((await otherOperator.request.get(`/api/v1/operator/queues/${queue.id}/desk`)).status()).toBe(403);
    const denials: { path: string; status: number; code: string }[] = [];
    for (const path of [`/queues/${queue.id}/call-next`, `/entries/${entryId}/start-service`, `/entries/${entryId}/complete`]) { const denied = await otherOperator.request.post(`/api/v1/operator${path}`, { headers: { Origin: origin }, data: {} }); const deniedBody = await denied.json(); expect(denied.status()).toBe(403); expect(deniedBody.error.code).toBe('QUEUE_ACCESS_DENIED'); denials.push({ path, status: denied.status(), code: deniedBody.error.code }); }
    expect(await db.queueEntry.findUniqueOrThrow({ where: { id: entryId } })).toEqual(before); expect(before.status).toBe('COMPLETED');
    expect(await db.queueEvent.findMany({ where: { entryId }, orderBy: { occurredAt: 'asc' } })).toEqual(beforeEvents);
    expect(beforeEvents.map(event => [event.eventType, event.actorId])).toEqual([['JOINED', a.id], ['CALLED', operatorA.id], ['STARTED', operatorA.id], ['COMPLETED', operatorA.id]]);
    writeFileSync(`${evidence}/journey-http-evidence.json`, JSON.stringify({ journey: 'TEST-043', join: { status: joined.status(), number: saved.displayNumber, partySize: saved.partySize }, duplicate: { status: duplicate.status(), code: duplicateBody.error.code }, crossCustomer: { status: foreign.status(), code: foreignBody.error.code }, unassignedOperatorOnR: denials, persistedStatus: before.status, audit: beforeEvents.map(event => ({ type: event.eventType, from: event.fromStatus, to: event.toStatus, occurredAt: event.occurredAt.toISOString(), actorRole: event.actorId === a.id ? 'CUSTOMER' : 'OPERATOR' })), publicResponse: publicBody }, null, 2));
  } finally {
    for (const context of contexts) await context.close();
    // Clean only this test's saved entry/sessions; production never deletes history or resets counters.
    if (entryId) { await db.queueEvent.deleteMany({ where: { entryId } }); await db.queueEntry.delete({ where: { id: entryId } }); await db.queue.update({ where: { id: queue.id }, data: { lastSequence: queue.lastSequence } }); }
    await db.session.deleteMany({ where: { id: { in: sessions } } });
  }
});

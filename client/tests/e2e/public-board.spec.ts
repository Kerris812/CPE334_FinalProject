import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const local = Object.fromEntries(readFileSync('../server/.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL, process.env.DATABASE_URL ?? local.DATABASE_URL) });
let customers: { id: string; email: string; displayName: string }[] = [];
let queue: { id: string; code: string };
let current: { id: string; displayNumber: string };
let waiting: { id: string };
test.beforeEach(async () => {
  const seeded = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  for (let i = 0; i < 2; i++) customers.push(await db.user.create({ data: { email: `board-${randomUUID()}@example.test`, displayName: `Private board guest ${i}`, role: 'CUSTOMER', passwordHash: seeded.passwordHash } }));
  queue = await db.queue.create({ data: { code: `B${randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()}`, name: 'Private restaurant detail' } });
  current = await db.queueEntry.create({ data: { queueId: queue.id, customerId: customers[0].id, sequence: 10000n, displayNumber: `${queue.code}-10000`, partySize: 4, status: 'CALLED' } });
  waiting = await db.queueEntry.create({ data: { queueId: queue.id, customerId: customers[1].id, sequence: 10001n, displayNumber: `${queue.code}-10001`, partySize: 2, status: 'WAITING' } });
});
test.afterEach(async () => {
  const ids = customers.map(row => row.id);
  await db.queueEvent.deleteMany({ where: { entry: { customerId: { in: ids } } } }); await db.queueEntry.deleteMany({ where: { customerId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); customers = [];
  if (queue) await db.queue.delete({ where: { id: queue.id } });
});
test.afterAll(() => db.$disconnect());
function assertPublic(body: unknown) {
  const paths: string[] = [];
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === 'object') {
      expect(Array.isArray(value)).toBe(false);
      for (const [key, child] of Object.entries(value)) { const next = path ? `${path}.${key}` : key; paths.push(next); visit(child, next); }
    }
  }
  visit(body, ''); expect(paths.sort()).toEqual(['data', 'data.calledNumber', 'data.queueCode', 'data.serviceState', 'data.waitingCount'].sort());
}
test('TEST-029 anonymous board polls real status/count changes, pauses when hidden and retries errors', async ({ page, context }) => {
  const bodies: Promise<unknown>[] = [];
  page.on('response', response => { if (response.url().endsWith(`/queues/${queue.id}/board`) && response.status() === 200) bodies.push(response.json()); });
  await page.clock.install(); await page.goto(`/board/${queue.id}`);
  await expect(page.getByText(current.displayNumber, { exact: true })).toBeVisible(); await expect(page.getByText('CALLED', { exact: true })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name === 'qs_session')).toBe(false);
  await db.queueEntry.update({ where: { id: current.id }, data: { status: 'SERVING' } }); await db.queueEntry.update({ where: { id: waiting.id }, data: { status: 'COMPLETED' } });
  await page.clock.runFor(10000); await expect(page.getByText('SERVING', { exact: true })).toBeVisible(); await expect(page.getByLabel('Waiting guests')).toHaveText('0');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const before = bodies.length; await page.clock.runFor(30000); expect(bodies.length).toBe(before);
  await db.queueEntry.update({ where: { id: current.id }, data: { status: 'COMPLETED' } });
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByText('No one is being called yet')).toBeVisible();
  await page.route('**/api/v1/public/queues/*/board', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"INTERNAL_ERROR"}}' }));
  await page.clock.runFor(10000); await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.unroute('**/api/v1/public/queues/*/board'); await page.getByRole('button', { name: 'Retry' }).click(); await expect(page.getByText('No one is being called yet')).toBeVisible();
  for (const body of await Promise.all(bodies)) assertPublic(body);
  const text = await page.locator('body').innerText();
  for (const value of customers.flatMap(customer => [customer.email, customer.displayName, customer.id]).concat([current.id, waiting.id, 'Private restaurant detail'])) expect(text.includes(value)).toBe(false);
  await expect(page.getByRole('button', { name: /sign in|log out/i })).toHaveCount(0); await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});
test('public board reserves large type for numbers and uses accessible quiet controls across viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`/board/${queue.id}`);
  const number = page.getByText(current.displayNumber, { exact: true }); await expect(number).toBeVisible();
  const board = page.locator('section.public-board');
  await expect(page.getByRole('region', { name: 'Public queue status', exact: true })).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.queue-ticket-content')).toHaveCSS('animation-duration', '0.15s');
  await expect(page.getByLabel('Waiting guests')).toHaveCSS('font-size', '48px');
  const nav = page.getByRole('navigation', { name: 'Queue displays' });
  expect(await nav.evaluate(element => element.closest('.public-board') === null)).toBe(true);
  await expect(board).toHaveCSS('background-color', 'rgb(255, 252, 247)');
  await expect(board.locator('.public-board-header')).toHaveCSS('background-color', 'rgb(246, 233, 234)');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCSS('background-color', 'rgb(111, 14, 34)');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(nav.locator('[aria-current="page"]')).toHaveText(`Queue ${queue.code}`);
  await expect(nav.locator('[aria-current="page"]')).toHaveCSS('color', 'rgb(251, 243, 230)');
  for (const width of [1440, 1024, 768, 360]) {
    await page.setViewportSize({ width, height: 900 }); await expect(number).toBeVisible();
    const fontSize = await number.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(72); expect(fontSize).toBeLessThanOrEqual(120);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of await page.locator('.board-navigation a, .board-navigation button, .public-board button').all()) {
      const box = (await control.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `/tmp/cpe334-refined-board-${width}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.queue-ticket-content')).toHaveCSS('animation-name', 'none');
  await db.queueEntry.update({ where: { id: current.id }, data: { status: 'COMPLETED' } });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const empty = page.getByText('No one is being called yet', { exact: true }); await expect(empty).toBeVisible();
  const emptySize = await empty.evaluate(element => parseFloat(getComputedStyle(element).fontSize)); expect(emptySize).toBeGreaterThanOrEqual(28); expect(emptySize).toBeLessThanOrEqual(32);
  await page.screenshot({ path: '/tmp/cpe334-refined-empty-360.png', fullPage: true });
});
test('home public board navigation is visible and opens the seeded board without login', async ({ page, context }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'View public board' });
  await expect(link).toBeVisible(); await expect(link).toHaveAttribute('href', '/board');
  await page.screenshot({ path: '/tmp/cpe334-home-public-board-link.png', fullPage: true });
  await link.click(); await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole('heading', { name: 'Queue R', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Queue S', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Both queues', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.getByRole('navigation', { name: 'Queue displays' }).evaluate(element => element.closest('.public-board') === null)).toBe(true);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  expect((await context.cookies()).some(cookie => cookie.name === 'qs_session')).toBe(false);
  for (const width of [1440, 1024, 768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cards = await page.locator('.public-board-grid > .public-board').all();
    const boxes = await Promise.all(cards.map(card => card.boundingBox()));
    if (width >= 1024) { expect(Math.abs(boxes[0]!.height - boxes[1]!.height)).toBeLessThan(1); expect(boxes[0]!.y).toBe(boxes[1]!.y); }
    else expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
    await page.screenshot({ path: `/tmp/cpe334-refined-overview-${width}.png`, fullPage: true });
  }
});

test('unavailable and failed queues retain approved queue labels and navigation with safe retry states', async ({ page }) => {
  await page.route('**/api/v1/public/queues/S/board', route => route.fulfill({ status: 404, json: { error: { code: 'QUEUE_NOT_FOUND', message: 'Private database diagnostic' } } }));
  await page.goto('/board');
  const unavailable = page.getByRole('alert').filter({ hasText: "This queue isn't available" });
  await expect(unavailable).toBeVisible(); await expect(unavailable.getByRole('button', { name: 'Retry' })).toBeVisible();
  const retryTextOffset = await unavailable.getByRole('button', { name: 'Retry' }).evaluate(button => {
    const range = document.createRange(); range.selectNodeContents(button.querySelector('.ui-button-label')!);
    const text = range.getBoundingClientRect(); const box = button.getBoundingClientRect();
    return Math.abs(text.x + text.width / 2 - box.x - box.width / 2);
  });
  expect(retryTextOffset).toBeLessThan(1);
  await expect(page.getByRole('link', { name: 'Queue S', exact: true })).toHaveAttribute('href', '/board/S');
  await expect(page.getByRole('heading', { name: 'Queue S', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Queue R', exact: true })).toBeVisible();
  await page.route('**/api/v1/public/queues/R/board', route => route.fulfill({ status: 503, json: { error: { message: 'Private database diagnostic' } } }));
  const r = page.locator('.public-board').filter({ has: page.getByRole('heading', { name: 'Queue R', exact: true }) });
  await r.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: "We couldn't load this. Please try again." })).toBeVisible();
  await expect(page.getByText('Private database diagnostic')).toHaveCount(0);
  for (const width of [1440, 1024, 768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1024) {
      const boxes = await Promise.all((await page.locator('.public-board').all()).map(card => card.boundingBox()));
      expect(Math.abs(boxes[0]!.height - boxes[1]!.height)).toBeLessThan(1);
    }
    await page.screenshot({ path: `/tmp/cpe334-refined-errors-${width}.png`, fullPage: true });
  }
  await page.unroute('**/api/v1/public/queues/R/board');
  await r.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(r.getByRole('heading', { name: 'No one is being called yet' })).toBeVisible();
  await page.unroute('**/api/v1/public/queues/S/board');
  await unavailable.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Queue S', exact: true })).toBeVisible();
  await expect(page.locator('.public-board').filter({ has: page.getByRole('heading', { name: 'Queue S', exact: true }) }).getByRole('heading', { name: 'No one is being called yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Queue S', exact: true })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { seed } from '../../../server/prisma/seed';
import { randomUUID } from 'node:crypto';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';

const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL) });
test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.afterAll(() => db.$disconnect());
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
for (const code of ['R', 'S'] as const) {
  test(`L7-001 L7-002 L7-005 seeded A/B browser handoff completes Queue ${code}`, async ({ browser }) => {
    await seed(db);
    const queue = await db.queue.findUniqueOrThrow({ where: { code } });
    const template = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
    const customer = await db.user.create({ data: { email: `lab7-browser-${randomUUID()}@example.test`, displayName: 'Lab 7 Browser Customer', role: 'CUSTOMER', passwordHash: template.passwordHash } });
    const seededOperators = await db.user.findMany({ where: { email: { in: ['operator.a@example.test', 'operator.b@example.test'] } } });
    const previousSessions = await db.session.findMany({ where: { userId: { in: seededOperators.map(u => u.id) } }, select: { id: true } });
    const customerContext = await browser.newContext();
    const aContext = await browser.newContext();
    const bContext = await browser.newContext();
    try {
      const customerPage = await customerContext.newPage();
      const a = await aContext.newPage();
      const b = await bContext.newPage();
      await login(customerPage, customer.email, process.env.DEMO_CUSTOMER_PASSWORD!);
      await customerPage.getByLabel('Party size').fill(code === 'R' ? '4' : '5');
      await customerPage.getByRole('button', { name: 'Join queue', exact: true }).click();
      await customerPage.getByRole('link', { name: 'View my queue' }).click();
      await expect(customerPage.getByText('WAITING', { exact: true })).toBeVisible();
      await login(a, 'operator.a@example.test', process.env.DEMO_OPERATOR_PASSWORD!);
      await login(b, 'operator.b@example.test', process.env.DEMO_OPERATOR_PASSWORD!);
      await expect(a.getByLabel('Assigned queue').locator('option')).toHaveText(['R — Restaurant Waiting Queue', 'S — Large Party Waiting Queue']);
      await expect(b.getByLabel('Assigned queue').locator('option')).toHaveText(['R — Restaurant Waiting Queue', 'S — Large Party Waiting Queue']);
      for (const page of [a, b]) await page.getByLabel('Assigned queue').selectOption(queue.id);
      const caller = code === 'R' ? a : b;
      const starter = code === 'R' ? b : a;
      await caller.getByRole('button', { name: 'Call Next', exact: true }).click();
      await expect(caller.getByText('CALLED', { exact: true })).toBeVisible();
      await starter.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(starter.getByRole('button', { name: 'Start Service', exact: true })).toBeEnabled();
      await starter.getByRole('button', { name: 'Start Service', exact: true }).click();
      await expect(starter.getByText('SERVING', { exact: true })).toBeVisible();
      await caller.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(caller.getByRole('button', { name: 'Complete Service', exact: true })).toBeEnabled();
      await caller.getByRole('button', { name: 'Complete Service', exact: true }).click();
      await expect(caller.getByText('Service completed.')).toBeVisible();
      await customerPage.getByRole('button', { name: 'Refresh status', exact: true }).click();
      await expect(customerPage.getByText('COMPLETED', { exact: true })).toBeVisible();
      const entry = await db.queueEntry.findFirstOrThrow({ where: { customerId: customer.id } });
      const actors = [code === 'R' ? 'a' : 'b', code === 'R' ? 'b' : 'a', code === 'R' ? 'a' : 'b'];
      const events = await db.queueEvent.findMany({ where: { entryId: entry.id } });
      expect(events).toHaveLength(4);
      for (const [i, type] of ['CALLED', 'STARTED', 'COMPLETED'].entries()) expect(events.find(e => e.eventType === type)?.actorId).toBe(seededOperators.find(u => u.email === `operator.${actors[i]}@example.test`)?.id);
    } finally {
      await customerContext.close();
      await aContext.close();
      await bContext.close();
      await db.queueEvent.deleteMany({ where: { entry: { customerId: customer.id } } });
      await db.queueEntry.deleteMany({ where: { customerId: customer.id } });
      await db.session.deleteMany({ where: { userId: customer.id } });
      await db.user.delete({ where: { id: customer.id } });
      await db.queue.update({ where: { id: queue.id }, data: { lastSequence: queue.lastSequence, state: queue.state } });
      await db.session.deleteMany({ where: { userId: { in: seededOperators.map(u => u.id) }, id: { notIn: previousSessions.map(s => s.id) } } });
    }
  });
}

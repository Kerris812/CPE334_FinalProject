# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lab7-shared-operators.spec.ts >> L7-001 L7-002 L7-005 seeded A/B browser handoff completes Queue S
- Location: tests/e2e/lab7-shared-operators.spec.ts:17:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByLabel('Assigned queue').locator('option')
Timeout: 5000ms
- Expected  - 1
+ Received  + 0

  Array [
    "R — Restaurant Waiting Queue",
-   "S — Large Party Waiting Queue",
  ]

Call log:
  - Expect "toHaveText" getByLabel('Assigned queue').locator('option') with timeout 5000ms
  - waiting for getByLabel('Assigned queue').locator('option')
    14 × locator resolved to 1 element

```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
  3  | import { seed } from '../../../server/prisma/seed';
  4  | import { randomUUID } from 'node:crypto';
  5  | import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
  6  | 
  7  | const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL) });
  8  | test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
  9  | test.afterAll(() => db.$disconnect());
  10 | async function login(page: Page, email: string, password: string) {
  11 |   await page.goto('/login');
  12 |   await page.getByLabel('Email').fill(email);
  13 |   await page.getByLabel('Password', { exact: true }).fill(password);
  14 |   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  15 | }
  16 | for (const code of ['R', 'S'] as const) {
  17 |   test(`L7-001 L7-002 L7-005 seeded A/B browser handoff completes Queue ${code}`, async ({ browser }) => {
  18 |     await seed(db);
  19 |     const queue = await db.queue.findUniqueOrThrow({ where: { code } });
  20 |     const template = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  21 |     const customer = await db.user.create({ data: { email: `lab7-browser-${randomUUID()}@example.test`, displayName: 'Lab 7 Browser Customer', role: 'CUSTOMER', passwordHash: template.passwordHash } });
  22 |     const seededOperators = await db.user.findMany({ where: { email: { in: ['operator.a@example.test', 'operator.b@example.test'] } } });
  23 |     const previousSessions = await db.session.findMany({ where: { userId: { in: seededOperators.map(u => u.id) } }, select: { id: true } });
  24 |     const customerContext = await browser.newContext();
  25 |     const aContext = await browser.newContext();
  26 |     const bContext = await browser.newContext();
  27 |     try {
  28 |       const customerPage = await customerContext.newPage();
  29 |       const a = await aContext.newPage();
  30 |       const b = await bContext.newPage();
  31 |       await login(customerPage, customer.email, process.env.DEMO_CUSTOMER_PASSWORD!);
  32 |       await customerPage.getByLabel('Party size').fill(code === 'R' ? '4' : '5');
  33 |       await customerPage.getByRole('button', { name: 'Join queue', exact: true }).click();
  34 |       await customerPage.getByRole('link', { name: 'View my queue' }).click();
  35 |       await expect(customerPage.getByText('WAITING', { exact: true })).toBeVisible();
  36 |       await login(a, 'operator.a@example.test', process.env.DEMO_OPERATOR_PASSWORD!);
  37 |       await login(b, 'operator.b@example.test', process.env.DEMO_OPERATOR_PASSWORD!);
> 38 |       await expect(a.getByLabel('Assigned queue').locator('option')).toHaveText(['R — Restaurant Waiting Queue', 'S — Large Party Waiting Queue']);
     |                                                                      ^ Error: expect(locator).toHaveText(expected) failed
  39 |       await expect(b.getByLabel('Assigned queue').locator('option')).toHaveText(['R — Restaurant Waiting Queue', 'S — Large Party Waiting Queue']);
  40 |       for (const page of [a, b]) await page.getByLabel('Assigned queue').selectOption(queue.id);
  41 |       const caller = code === 'R' ? a : b;
  42 |       const starter = code === 'R' ? b : a;
  43 |       await caller.getByRole('button', { name: 'Call Next', exact: true }).click();
  44 |       await expect(caller.getByText('CALLED', { exact: true })).toBeVisible();
  45 |       await starter.getByRole('button', { name: 'Refresh', exact: true }).click();
  46 |       await expect(starter.getByRole('button', { name: 'Start Service', exact: true })).toBeEnabled();
  47 |       await starter.getByRole('button', { name: 'Start Service', exact: true }).click();
  48 |       await expect(starter.getByText('SERVING', { exact: true })).toBeVisible();
  49 |       await caller.getByRole('button', { name: 'Refresh', exact: true }).click();
  50 |       await expect(caller.getByRole('button', { name: 'Complete Service', exact: true })).toBeEnabled();
  51 |       await caller.getByRole('button', { name: 'Complete Service', exact: true }).click();
  52 |       await expect(caller.getByText('Service completed.')).toBeVisible();
  53 |       await customerPage.getByRole('button', { name: 'Refresh status', exact: true }).click();
  54 |       await expect(customerPage.getByText('COMPLETED', { exact: true })).toBeVisible();
  55 |       const entry = await db.queueEntry.findFirstOrThrow({ where: { customerId: customer.id } });
  56 |       const actors = [code === 'R' ? 'a' : 'b', code === 'R' ? 'b' : 'a', code === 'R' ? 'a' : 'b'];
  57 |       const events = await db.queueEvent.findMany({ where: { entryId: entry.id } });
  58 |       expect(events).toHaveLength(4);
  59 |       for (const [i, type] of ['CALLED', 'STARTED', 'COMPLETED'].entries()) expect(events.find(e => e.eventType === type)?.actorId).toBe(seededOperators.find(u => u.email === `operator.${actors[i]}@example.test`)?.id);
  60 |     } finally {
  61 |       await customerContext.close();
  62 |       await aContext.close();
  63 |       await bContext.close();
  64 |       await db.queueEvent.deleteMany({ where: { entry: { customerId: customer.id } } });
  65 |       await db.queueEntry.deleteMany({ where: { customerId: customer.id } });
  66 |       await db.session.deleteMany({ where: { userId: customer.id } });
  67 |       await db.user.delete({ where: { id: customer.id } });
  68 |       await db.queue.update({ where: { id: queue.id }, data: { lastSequence: queue.lastSequence, state: queue.state } });
  69 |       await db.session.deleteMany({ where: { userId: { in: seededOperators.map(u => u.id) }, id: { notIn: previousSessions.map(s => s.id) } } });
  70 |     }
  71 |   });
  72 | }
  73 | 
```
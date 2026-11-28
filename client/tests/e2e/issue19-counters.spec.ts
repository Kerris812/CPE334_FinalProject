import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fixture } from '../../../server/tests/support/queue-fixture';
import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';
const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL) });
test.afterAll(() => db.$disconnect());

for (const width of [320, 1280]) test(`S2-TEST-11/12/20: dedicated counters, handoff and historical release at ${width}px`, async ({ browser, baseURL }) => {
  const f = await fixture(db);
  const contexts = await Promise.all([browser.newContext({ viewport: { width, height: 1000 } }), browser.newContext({ viewport: { width, height: 1000 } })]);
  const evidence = process.env.ISSUE19_EVIDENCE_DIR;
  if (evidence) mkdirSync(evidence, { recursive: true });
  try {
    const s = await f.useS();
    const a = await f.actor('OPERATOR'); const b = await f.actor('OPERATOR');
    await db.operatorQueueAssignment.createMany({ data: [a, b].flatMap(actor => [f.queue, s].map(q => ({ operatorId: actor.id, queueId: q.id }))) });
    const rEntry = await f.entry();
    const sEntry = await f.entry('WAITING', await f.actor(), s);
    await db.queueEntry.update({ where: { id: sEntry.id }, data: { partySize: 5 } });
    for (const [index, actor] of [a, b].entries()) await contexts[index].addCookies([{ name: 'qs_session', value: actor.cookie.slice('qs_session='.length), url: baseURL! }]);
    const [hostA, hostB] = await Promise.all(contexts.map(context => context.newPage()));
    await hostA.goto('/operator/desk'); await hostB.goto('/operator/desk');
    await hostB.getByLabel('Assigned queue').selectOption(s.id);
    await expect(hostA.getByText('Counter R', { exact: true })).toBeVisible();
    await expect(hostB.getByText('Counter S', { exact: true })).toBeVisible();
    await expect(hostA.getByText('AVAILABLE', { exact: true })).toBeVisible();
    if (evidence) await hostA.screenshot({ path: `${evidence}/available-${width}.png`, fullPage: true });
    await hostA.getByRole('button', { name: 'Call Next', exact: true }).click();
    await hostB.getByRole('button', { name: 'Call Next', exact: true }).click();
    for (const host of [hostA, hostB]) {
      await expect(host.getByText('OCCUPIED', { exact: true })).toBeVisible();
      await expect(host.getByRole('button', { name: 'Call Next', exact: true })).toBeDisabled();
      expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (evidence) await hostB.screenshot({ path: `${evidence}/occupied-s-${width}.png`, fullPage: true });
    const cr = await db.serviceCounter.findUniqueOrThrow({ where: { code: 'R' } });
    const denied = await hostB.request.post(`/api/v1/operator/queues/${f.queue.id}/call-next`, { headers: { Origin: baseURL! }, data: { counterId: cr.id, expectedEntryId: rEntry.id } });
    expect(denied.status()).toBe(409); expect((await denied.json()).error.code).toBe('SERVICE_SLOT_BUSY');
    await hostB.getByLabel('Assigned queue').selectOption(f.queue.id);
    await hostB.getByRole('button', { name: 'Start Service', exact: true }).click();
    await expect(hostB.getByText('SERVING', { exact: true })).toBeVisible();
    await hostA.getByRole('button', { name: 'Refresh', exact: true }).click();
    await hostA.getByRole('button', { name: 'Complete Service', exact: true }).click();
    await expect(hostA.getByText('AVAILABLE', { exact: true })).toBeVisible();
    expect((await db.queueEntry.findUniqueOrThrow({ where: { id: rEntry.id } })).counterId).toBe(cr.id);
    await db.queueEntry.update({ where: { id: sEntry.id }, data: { calledAt: new Date(Date.now() - 301_000) } });
    await hostA.getByLabel('Assigned queue').selectOption(s.id);
    await hostA.getByRole('button', { name: 'Mark no-show', exact: true }).click();
    await expect(hostA.getByRole('dialog')).toContainText('Counter S');
    await hostA.getByRole('button', { name: 'Confirm no-show', exact: true }).click();
    await expect(hostA.getByText('AVAILABLE', { exact: true })).toBeVisible();
    const rEvents = await db.queueEvent.findMany({ where: { entryId: rEntry.id }, orderBy: { occurredAt: 'asc' } });
    expect(rEvents.map(event => [event.eventType, event.actorId])).toEqual([['CALLED', a.id], ['STARTED', b.id], ['COMPLETED', a.id]]);
    expect((await db.queueEntry.findUniqueOrThrow({ where: { id: sEntry.id } })).counterId).not.toBeNull();
    if (evidence) await hostA.screenshot({ path: `${evidence}/released-s-${width}.png`, fullPage: true });
  } finally { await Promise.all(contexts.map(context => context.close())); await f.clean(); }
});

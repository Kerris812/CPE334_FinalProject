import { expect, test } from '@playwright/test';
import { fixture } from '../../../server/tests/support/queue-fixture';

import { PrismaClient } from '../../../server/node_modules/@prisma/client/index.js';
import { testDatabaseUrl } from '../../../server/src/infrastructure/test-database';

const db = new PrismaClient({ datasourceUrl: testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL) });
test.afterAll(() => db.$disconnect());

test('S2-TEST-26: customer and operator cancellation, manual no-show and rejoin', async ({ browser, baseURL }) => {
  const f = await fixture(db);
  const customerContext = await browser.newContext();
  const operatorContext = await browser.newContext();
  try {
    const operator = await f.actor('OPERATOR');
    await db.operatorQueueAssignment.create({ data: { operatorId: operator.id, queueId: f.queue.id } });
    for (const [context, actor] of [[customerContext, f.customer], [operatorContext, operator]] as const) {
      await context.addCookies([{ name: 'qs_session', value: actor.cookie.slice('qs_session='.length), url: baseURL! }]);
    }
    const customer = await customerContext.newPage();
    const host = await operatorContext.newPage();
    async function join() {
      await customer.goto('/queues');
      await customer.getByRole('button', { name: 'Join queue', exact: true }).click();
      await customer.getByRole('link', { name: 'View my queue' }).click();
      await expect(customer.getByText('WAITING', { exact: true })).toBeVisible();
    }
    await join();
    await customer.getByRole('button', { name: 'Cancel queue entry' }).click();
    await expect(customer.getByRole('dialog')).toContainText('lose your current position');
    await customer.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(customer.getByRole('button', { name: 'Cancel queue entry' })).toBeFocused();
    await customer.getByRole('button', { name: 'Cancel queue entry' }).click();
    await customer.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(customer.getByText('CANCELLED', { exact: true })).toBeVisible();

    await join();
    await host.goto('/operator/desk');
    await host.getByRole('button', { name: 'Cancel waiting entry' }).click();
    await host.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(host.getByText(/enter a single-line reason/i)).toBeVisible();
    await host.getByLabel('Cancellation reason').fill('Guest requested cancellation');
    await host.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(host.getByText(/R-\d+ cancelled\./)).toBeVisible();
    await customer.getByRole('button', { name: 'Refresh status' }).click();
    await expect(customer.getByText('CANCELLED', { exact: true })).toBeVisible();

    await join();
    await host.getByRole('button', { name: 'Refresh', exact: true }).click();
    await host.getByRole('button', { name: 'Call Next' }).click();
    const noShow = host.getByRole('button', { name: 'Mark no-show' });
    await expect(noShow).toBeDisabled();
    const called = await db.queueEntry.findFirstOrThrow({ where: { customerId: f.customer.id, status: 'CALLED' } });
    await db.queueEntry.update({ where: { id: called.id }, data: { calledAt: new Date(Date.now() - 301_000) } });
    await host.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(noShow).toBeEnabled();
    expect((await db.queueEntry.findUniqueOrThrow({ where: { id: called.id } })).status).toBe('CALLED');
    await noShow.click();
    await host.getByRole('button', { name: 'Confirm no-show' }).click();
    await expect(host.getByText(/marked no-show/)).toBeVisible();
    await customer.getByRole('button', { name: 'Refresh status' }).click();
    await expect(customer.getByText('NO_SHOW', { exact: true })).toBeVisible();
    await join();

    const events = await db.queueEvent.findMany({ where: { entry: { customerId: f.customer.id } } });
    expect(events.filter(event => event.eventType === 'CANCELLED').map(event => event.actorId)).toEqual(expect.arrayContaining([f.customer.id, operator.id]));
    expect(events.find(event => event.eventType === 'NO_SHOW')?.actorId).toBe(operator.id);
  } finally {
    await customerContext.close();
    await operatorContext.close();
    await f.clean();
  }
});

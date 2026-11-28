import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { db, fixture, origin, setup, type Fixture } from '../support/queue-fixture.js';

const app = createApp({ db });
const api = request(app);
const root = '/api/v1';
let f: Fixture;
beforeAll(setup);
beforeEach(async () => { f = await fixture(); });
afterEach(async () => { await f.clean(); });
afterAll(async () => { await db.$disconnect(); });

function cancel(role: 'customer' | 'operator', id: string, cookie?: string, body: object = {}) {
  return api.post(`${root}/${role}/entries/${id}/cancel`).set('Origin', origin).set('Cookie', cookie ?? '').send(body);
}

test('S2-TEST-01: owner cancels atomically, then rejoins with a new number', async () => {
  const joined = await api.post(`${root}/queues/${f.queue.id}/entries`).set('Origin', origin).set('Cookie', f.customer.cookie).send({ partySize: 4 });
  expect(joined.status).toBe(201);
  const entry = joined.body.data;
  const response = await cancel('customer', entry.id, f.customer.cookie);
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ status: 'CANCELLED', displayNumber: entry.displayNumber, position: null, estimatedWaitMinutes: null });
  const at = new Date(response.body.data.cancelledAt);
  expect(await db.queueEvent.findFirst({ where: { entryId: entry.id, eventType: 'CANCELLED' } })).toMatchObject({ actorId: f.customer.id, reason: null, occurredAt: at, fromStatus: 'WAITING', toStatus: 'CANCELLED' });
  expect(await db.queueEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ cancelledAt: at, sequence: BigInt(entry.sequence), displayNumber: entry.displayNumber });
  const second = await api.post(`${root}/queues/${f.queue.id}/entries`).set('Origin', origin).set('Cookie', f.customer.cookie).send({ partySize: 4 });
  expect(second.status).toBe(201);
  expect(second.body.data.sequence).toBe(entry.sequence + 1);
});

test('S2-TEST-02/04: operator requires a valid reason and exposes it only in audit storage', async () => {
  const assigned = await f.actor('OPERATOR');
  const queue = await f.useS();
  await db.operatorQueueAssignment.create({ data: { operatorId: assigned.id, queueId: queue.id } });
  const entry = await f.entry('WAITING', f.customer, queue, 100n);
  for (const body of [{}, { reason: '  ' }, { reason: 'a\nb' }, { reason: 'a\u0085b' }, { reason: '\ta' }, { reason: '🤝'.repeat(201) }, { reason: 1 }, { reason: 'ok', actorId: assigned.id }]) {
    const result = await cancel('operator', entry.id, assigned.cookie, body);
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  }
  const reason = '🤝'.repeat(200);
  const result = await cancel('operator', entry.id, assigned.cookie, { reason: ` ${reason} ` });
  expect(result.status).toBe(200);
  expect(result.body.data).toMatchObject({ status: 'CANCELLED', counterId: null, noShowAt: null });
  expect(await db.queueEvent.findFirst({ where: { entryId: entry.id } })).toMatchObject({ reason, actorId: assigned.id, occurredAt: new Date(result.body.data.cancelledAt) });
  const own = await api.get(`${root}/customer/entries/${entry.id}`).set('Cookie', f.customer.cookie);
  expect(own.body.data.status).toBe('CANCELLED');
  expect(own.body.data.cancelledAt).toBe(result.body.data.cancelledAt);
  const board = await api.get(`${root}/public/queues/${queue.id}/board`);
  expect(board.body.data).toMatchObject({ waitingCount: 0, calledNumber: null });
  for (const response of [result, own, board]) {
    expect(response.text).not.toContain(reason);
    expect(response.text).not.toContain(assigned.id);
  }
  expect((await cancel('operator', entry.id, assigned.cookie, { reason })).body.error.code).toBe('INVALID_TRANSITION');
});

test('S2-TEST-03: cancellation enforces ownership, assignment, role and source state', async () => {
  const foreign = await f.actor();
  const operator = await f.actor('OPERATOR');
  const entry = await f.entry('WAITING', f.customer, f.queue, 101n);
  expect((await cancel('customer', entry.id)).status).toBe(401);
  expect((await cancel('customer', entry.id, foreign.cookie)).body.error.code).toBe('ENTRY_NOT_FOUND');
  expect((await cancel('operator', entry.id, f.customer.cookie)).body.error.code).toBe('FORBIDDEN');
  expect((await cancel('operator', entry.id, operator.cookie)).body.error.code).toBe('QUEUE_ACCESS_DENIED');
  expect((await cancel('customer', entry.id, f.customer.cookie, { reason: 'not accepted' })).status).toBe(422);
  await db.operatorQueueAssignment.create({ data: { operatorId: operator.id, queueId: f.queue.id } });
  for (const [index, status] of (['CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const).entries()) {
    if (status === 'SERVING') await db.queueEntry.updateMany({ where: { queueId: f.queue.id, status: 'CALLED' }, data: { status: 'COMPLETED' } });
    const owner = await f.actor();
    const target = await f.entry(status, owner, f.queue, BigInt(index + 102));
    const before = await f.state();
    expect((await cancel('customer', target.id, owner.cookie)).body.error.code).toBe('INVALID_TRANSITION');
    expect((await cancel('operator', target.id, operator.cookie, { reason: 'x' })).body.error.code).toBe('INVALID_TRANSITION');
    expect(await f.state()).toEqual(before);
  }
});

test('S2-TEST-05: concurrent cancellation and call cannot both transition the same entry', async () => {
  const operator = await f.actor('OPERATOR');
  await db.operatorQueueAssignment.create({ data: { operatorId: operator.id, queueId: f.queue.id } });
  const entry = await f.entry('WAITING', f.customer, f.queue, 201n);
  const results = await Promise.all([
    cancel('customer', entry.id, f.customer.cookie),
    api.post(`${root}/operator/queues/${f.queue.id}/call-next`).set('Origin', origin).set('Cookie', operator.cookie).send({}),
  ]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(await db.queueEvent.count({ where: { entryId: entry.id } })).toBe(1);
});

test('S2-TEST-04: audit insert failure rolls back cancellation', async () => {
  const entry = await f.entry('WAITING', f.customer, f.queue, 301n);
  const before = await f.state();
  await db.$executeRawUnsafe("CREATE FUNCTION issue18_reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cancellation audit failure'; END $$");
  try {
    await db.$executeRawUnsafe("CREATE TRIGGER issue18_reject_cancel BEFORE INSERT ON queue_events FOR EACH ROW WHEN (NEW.event_type = 'CANCELLED') EXECUTE FUNCTION issue18_reject_cancel()");
    expect((await cancel('customer', entry.id, f.customer.cookie)).status).toBe(500);
    expect(await f.state()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe('DROP FUNCTION issue18_reject_cancel() CASCADE');
  }
});

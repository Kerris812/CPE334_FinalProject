import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { db, fixture, origin, setup, type Fixture } from '../support/queue-fixture.js';

let now: Date;
let f: Fixture;
let operator: Awaited<ReturnType<Fixture['actor']>>;
let caller: Awaited<ReturnType<Fixture['actor']>>;
const app = createApp({ db, now: () => now });
const api = request(app);
const root = '/api/v1';
const calledAt = new Date();
beforeAll(setup);
beforeEach(async () => {
  now = calledAt;
  f = await fixture();
  [operator, caller] = await Promise.all([f.actor('OPERATOR'), f.actor('OPERATOR')]);
  await db.operatorQueueAssignment.createMany({ data: [operator, caller].map(actor => ({ operatorId: actor.id, queueId: f.queue.id })) });
});
afterEach(async () => { await f.clean(); });
afterAll(async () => { await db.$disconnect(); });

function act(id: string, action = 'no-show', cookie = operator.cookie, body: object = {}) {
  return api.post(`${root}/operator/entries/${id}/${action}`).set('Origin', origin).set('Cookie', cookie).send(body);
}
async function callNext() {
  return api.post(`${root}/operator/queues/${f.queue.id}/call-next`).set('Origin', origin).set('Cookie', caller.cookie).send({});
}
async function calledEntry() {
  const entry = await f.entry('CALLED', f.customer, f.queue, 100n);
  await db.queueEntry.update({ where: { id: entry.id }, data: { calledAt } });
  await db.queueEvent.create({ data: { entryId: entry.id, actorId: caller.id, eventType: 'CALLED', fromStatus: 'WAITING', toStatus: 'CALLED', occurredAt: calledAt } });
  return entry;
}

test.each([299999, 300000, 300001])('S2-TEST-06: no-show boundary at %i ms', async elapsed => {
  const entry = await calledEntry();
  now = new Date(+calledAt + elapsed);
  const before = await f.state();
  expect((await api.get(`${root}/public/queues/${f.queue.id}/board`)).body.data.calledNumber).toBe(entry.displayNumber);
  expect(await f.state()).toEqual(before);
  const response = await act(entry.id);
  if (elapsed < 300000) {
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'NO_SHOW_TOO_EARLY', details: { eligibleAt: new Date(+calledAt + 300000).toISOString() } });
    expect(await f.state()).toEqual(before);
  } else {
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'NO_SHOW', noShowAt: now.toISOString(), cancelledAt: null, counterId: f.counterId });
    expect(await db.queueEvent.findMany({ where: { entryId: entry.id }, orderBy: { occurredAt: 'asc' } })).toMatchObject([
      { eventType: 'CALLED', actorId: caller.id },
      { eventType: 'NO_SHOW', actorId: operator.id, fromStatus: 'CALLED', toStatus: 'NO_SHOW', occurredAt: now },
    ]);
    expect((await act(entry.id)).body.error.code).toBe('INVALID_TRANSITION');
    const own = await api.get(`${root}/customer/entries/${entry.id}`).set('Cookie', f.customer.cookie);
    expect(own.body.data).toMatchObject({ status: 'NO_SHOW', noShowAt: now.toISOString() });
    const waiting = await f.entry('WAITING', await f.actor(), f.queue, 101n);
    expect((await callNext()).body.data).toMatchObject({ id: waiting.id, status: 'CALLED' });
    const rejoined = await api.post(`${root}/queues/${f.queue.id}/entries`).set('Origin', origin).set('Cookie', f.customer.cookie).send({ partySize: 4 });
    expect(rejoined.status).toBe(201);
    expect(rejoined.body.data.displayNumber).not.toBe(entry.displayNumber);
  }
});

test('S2-TEST-07: authorization, invalid states and missing call time produce no writes', async () => {
  const unassigned = await f.actor('OPERATOR');
  const entry = await f.entry('CALLED', f.customer, f.queue, 200n);
  const before = await f.state();
  expect((await act(entry.id, 'no-show', '')).status).toBe(401);
  expect((await act(entry.id, 'no-show', f.customer.cookie)).body.error.code).toBe('FORBIDDEN');
  expect((await act(entry.id, 'no-show', unassigned.cookie)).body.error.code).toBe('QUEUE_ACCESS_DENIED');
  expect((await act(entry.id, 'no-show', operator.cookie, { force: true })).status).toBe(422);
  expect((await act(entry.id)).body.error.code).toBe('INVALID_TRANSITION');
  expect(await f.state()).toEqual(before);
  for (const status of ['WAITING', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
    await db.queueEntry.update({ where: { id: entry.id }, data: { status, counterId: status === 'WAITING' || status === 'CANCELLED' ? null : f.counterId } });
    const snapshot = await f.state();
    expect((await act(entry.id)).body.error.code).toBe('INVALID_TRANSITION');
    expect(await f.state()).toEqual(snapshot);
  }
});

test('S2-TEST-08: start and no-show race commits one edge', async () => {
  const entry = await calledEntry();
  now = new Date(+calledAt + 300000);
  const results = await Promise.all([act(entry.id), act(entry.id, 'start-service', caller.cookie)]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(results.find(result => result.status === 409)?.body.error.code).toBe('INVALID_TRANSITION');
  expect(await db.queueEvent.count({ where: { entryId: entry.id, fromStatus: 'CALLED' } })).toBe(1);
});

test('S2-TEST-08: audit failure rolls back no-show and keeps service slot occupied', async () => {
  const entry = await calledEntry();
  await f.entry('WAITING', await f.actor(), f.queue, 101n);
  now = new Date(+calledAt + 300000);
  const before = await f.state();
  await db.$executeRawUnsafe("CREATE FUNCTION issue18_reject_no_show() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test no-show audit failure'; END $$");
  try {
    await db.$executeRawUnsafe("CREATE TRIGGER issue18_reject_no_show BEFORE INSERT ON queue_events FOR EACH ROW WHEN (NEW.event_type = 'NO_SHOW') EXECUTE FUNCTION issue18_reject_no_show()");
    expect((await act(entry.id)).status).toBe(500);
    expect((await callNext()).body.error.code).toBe('SERVICE_SLOT_BUSY');
    expect(await f.state()).toEqual(before);
  } finally {
    await db.$executeRawUnsafe('DROP FUNCTION issue18_reject_no_show() CASCADE');
  }
});

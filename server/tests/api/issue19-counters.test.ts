import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { action, app, call, db, get, lab7Fixture, post, rejected, setup, type Lab7Fixture } from '../support/lab7-fixture.js';
import { origin } from '../support/queue-fixture.js';

let f: Lab7Fixture;
beforeAll(setup);
beforeEach(async () => { f = await lab7Fixture(); });
afterEach(async () => { await f.clean(); });
afterAll(() => db.$disconnect());

const counterId = expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
async function counter(queue = f.r, operator?: { id: string; cookie: string }) {
  operator ??= await f.seeded('a');
  const response = await get(`/operator/queues/${queue.id}/desk`, operator);
  expect(response.status).toBe(200);
  expect(response.body.data.counter).toMatchObject({ id: counterId, code: queue.code, name: `Counter ${queue.code}`, queueId: queue.id });
  return response.body.data.counter as { id: string; status: string; occupant: { entryId: string } | null };
}

for (const letter of ['a', 'b'] as const) for (const code of ['R', 'S'] as const) {
  test(`S2-TEST-19/25: Operator ${letter.toUpperCase()} reserves a persistent counter through legacy call in ${code}`, async () => {
    const operator = await f.seeded(letter);
    const queue = code === 'R' ? f.r : f.s;
    const { entry } = await f.join(queue);
    const response = await call(queue.id, operator);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: entry.id, status: 'CALLED', counterId });
    const [stored] = await db.$queryRaw<{ row: Record<string, unknown> }[]>`SELECT to_jsonb(e) AS row FROM queue_entries e WHERE id = ${entry.id}::uuid`;
    expect(stored.row).toMatchObject({ status: 'CALLED', counter_id: response.body.data.counterId });
    expect(await db.queueEvent.findMany({ where: { entryId: entry.id, eventType: 'CALLED' } })).toEqual([
      expect.objectContaining({ actorId: operator.id, fromStatus: 'WAITING', toStatus: 'CALLED' }),
    ]);
  });
}

test('S2-TEST-19: nonexistent selected counter is denied without consuming the FIFO head', async () => {
  const operator = await f.seeded('a');
  const { entry } = await f.join();
  await rejected(() => post(`/operator/queues/${f.r.id}/call-next`, operator, { counterId: randomUUID(), expectedEntryId: entry.id }), 'COUNTER_ACCESS_DENIED', 403);
});

test('S2-TEST-24: public active projection exposes only number, configured counter label and state, then clears on release', async () => {
  const operator = await f.seeded('a'); const { entry } = await f.join(); await f.join();
  await call(f.r.id, operator);
  const response = await get(`/public/queues/${f.r.id}/board`);
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual({ queueCode: 'R', calledNumber: entry.displayNumber, serviceState: 'CALLED', waitingCount: 1, activeEntries: [{ displayNumber: entry.displayNumber, counterLabel: 'Counter R', serviceState: 'CALLED' }] });
  await action(entry.id, 'start-service', operator); await action(entry.id, 'complete', operator);
  const released = await get(`/public/queues/${f.r.id}/board`);
  expect(released.body.data).toEqual({ queueCode: 'R', calledNumber: null, serviceState: null, waitingCount: 1, activeEntries: [] });
});

test('S2-TEST-19: absent legacy JSON body resolves the dedicated counter', async () => {
  const operator = await f.seeded('a'); const { entry } = await f.join();
  const response = await request(app).post(`/api/v1/operator/queues/${f.r.id}/call-next`).set('Cookie', operator.cookie).set('Origin', origin).set('Content-Type', 'application/json');
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: entry.id, counterId });
});

test.each([null, [], 'invalid'])('S2-TEST-19: non-object selection body %j is rejected without writes', async body => {
  const operator = await f.seeded('a'); await f.join();
  await rejected(() => post(`/operator/queues/${f.r.id}/call-next`, operator, body), 'VALIDATION_ERROR', 422);
});

test.each([
  { counterId: 'invalid' },
  { expectedEntryId: '10000000-0000-0000-0000-000000000001' },
  { counterId: '10000000-0000-0000-0000-000000000001', actorId: 'forged' },
])('S2-TEST-19: invalid counter selection payload %j is rejected before any writes', async body => {
  const operator = await f.seeded('b');
  await f.join();
  await rejected(() => post(`/operator/queues/${f.r.id}/call-next`, operator, body), 'VALIDATION_ERROR', 422);
});

test('S2-TEST-12: cross-operator start retains the reserved counter', async () => {
  const a = await f.seeded('a');
  const b = await f.seeded('b');
  const { entry } = await f.join();
  const called = await call(f.r.id, a);
  expect(called.status).toBe(200);
  expect(called.body.data.counterId).toEqual(counterId);
  const started = await action(entry.id, 'start-service', b);
  expect(started.status).toBe(200);
  expect(started.body.data).toMatchObject({ status: 'SERVING', counterId: called.body.data.counterId });
  const desk = await get(`/operator/queues/${f.r.id}/desk`, a);
  expect(desk.status).toBe(200);
  expect(desk.body.data.activeEntries).toEqual([
    expect.objectContaining({ id: entry.id, status: 'SERVING', counterId: called.body.data.counterId }),
  ]);
  expect(await db.queueEvent.findMany({ where: { entryId: entry.id, eventType: 'STARTED' } })).toEqual([
    expect.objectContaining({ actorId: b.id }),
  ]);
});

test('S2-TEST-19/25: unassigned, customer and revoked sessions cannot reserve a counter', async () => {
  const operator = await f.actor('OPERATOR');
  const { customer } = await f.join();
  await rejected(() => call(f.r.id, operator), 'QUEUE_ACCESS_DENIED', 403);
  await rejected(() => call(f.r.id, customer), 'FORBIDDEN', 403);
  await db.operatorQueueAssignment.create({ data: { operatorId: operator.id, queueId: f.r.id } });
  expect((await get(`/operator/queues/${f.r.id}/desk`, operator)).status).toBe(200);
  await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId: operator.id, queueId: f.r.id } } });
  await rejected(() => call(f.r.id, operator), 'QUEUE_ACCESS_DENIED', 403);
});

test('S2-TEST-13/14: simultaneous calls to the same counter have one winner and one audit event', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  const { entry } = await f.join(); const second = await f.join();
  const c = await counter();
  const responses = await Promise.all([a, b].map(actor => post(`/operator/queues/${f.r.id}/call-next`, actor, { counterId: c.id, expectedEntryId: entry.id })));
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect(responses.find(r => r.status === 409)!.body.error.code).toBe('SERVICE_SLOT_BUSY');
  expect((await db.queueEntry.findUniqueOrThrow({ where: { id: second.entry.id } })).status).toBe('WAITING');
  expect(await db.queueEvent.count({ where: { entryId: entry.id, eventType: 'CALLED' } })).toBe(1);
  expect(await counter()).toMatchObject({ status: 'OCCUPIED', occupant: { entryId: entry.id } });
});

test('S2-TEST-15/17: completion releases occupancy, retains history and preserves FIFO', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  const first = await f.join(); const second = await f.join();
  const c = await counter();
  expect((await call(f.r.id, a)).body.data).toMatchObject({ id: first.entry.id, counterId: c.id });
  expect((await action(first.entry.id, 'start-service', b)).body.data).toMatchObject({ counterId: c.id });
  expect((await action(first.entry.id, 'complete', a)).body.data).toMatchObject({ status: 'COMPLETED', counterId: c.id });
  expect(await counter()).toMatchObject({ status: 'AVAILABLE', occupant: null });
  expect((await call(f.r.id, b)).body.data).toMatchObject({ id: second.entry.id, counterId: c.id });
  const [stored] = await db.$queryRaw<{ row: Record<string, unknown> }[]>`SELECT to_jsonb(e) AS row FROM queue_entries e WHERE id = ${first.entry.id}::uuid`;
  expect(stored.row.counter_id).toBe(c.id);
});

test('S2-TEST-06/17: manual no-show frees only its counter and retains historical association', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  const r = await f.join(); const s = await f.join(f.s);
  const cr = await counter(); const cs = await counter(f.s);
  expect((await call(f.r.id, a)).status).toBe(200);
  expect((await call(f.s.id, b)).status).toBe(200);
  await db.queueEntry.update({ where: { id: r.entry.id }, data: { calledAt: new Date(Date.now() - 301_000) } });
  const response = await post(`/operator/entries/${r.entry.id}/no-show`, b);
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ status: 'NO_SHOW', counterId: cr.id });
  expect(await counter()).toMatchObject({ status: 'AVAILABLE', occupant: null });
  expect(await counter(f.s)).toMatchObject({ id: cs.id, status: 'OCCUPIED', occupant: { entryId: s.entry.id } });
});

test('S2-TEST-05: cancelling a waiting peer does not release an occupied counter', async () => {
  const a = await f.seeded('a'); const active = await f.join(); const waiting = await f.join();
  const c = await counter(); await call(f.r.id, a);
  expect((await post(`/customer/entries/${waiting.entry.id}/cancel`, waiting.customer)).status).toBe(200);
  expect(await counter()).toMatchObject({ id: c.id, status: 'OCCUPIED', occupant: { entryId: active.entry.id } });
});

test('S2-TEST-19: a counter from the other queue is rejected without writes', async () => {
  const a = await f.seeded('a'); const { entry } = await f.join(); const foreign = await counter(f.s);
  await rejected(() => post(`/operator/queues/${f.r.id}/call-next`, a, { counterId: foreign.id, expectedEntryId: entry.id }), 'COUNTER_ACCESS_DENIED', 403);
});

test('S2-TEST-20: R and S reserve independently and a busy R does not block S', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  await f.join(); await f.join(f.s);
  const cr = await counter(); const cs = await counter(f.s);
  const responses = await Promise.all([post(`/operator/queues/${f.r.id}/call-next`, a, { counterId: cr.id }), post(`/operator/queues/${f.s.id}/call-next`, b, { counterId: cs.id })]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  expect(responses.map(r => r.body.data.counterId)).toEqual([cr.id, cs.id]);
});

test('S2-TEST-19: stale FIFO preview is rejected without reserving a counter', async () => {
  const a = await f.seeded('a'); const c = await counter();
  await f.join(); const later = await f.join();
  await rejected(() => post(`/operator/queues/${f.r.id}/call-next`, a, { counterId: c.id, expectedEntryId: later.entry.id }), 'QUEUE_HEAD_CHANGED');
  expect(await counter()).toMatchObject({ status: 'AVAILABLE' });
});

test.each(['call', 'complete'] as const)('S2-TEST-27: audit persistence failure rolls back %s and counter occupancy', async stage => {
  const a = await f.seeded('a'); const { entry } = await f.join(); const c = await counter();
  if (stage === 'complete') { await call(f.r.id, a); await action(entry.id, 'start-service', a); }
  await db.$executeRawUnsafe(`CREATE FUNCTION issue19_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id = '${a.id}'::uuid THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER issue19_reject_event BEFORE INSERT ON queue_events FOR EACH ROW EXECUTE FUNCTION issue19_reject_event()');
  try {
    await rejected(() => stage === 'call' ? call(f.r.id, a) : action(entry.id, 'complete', a), 'INTERNAL_ERROR', 500);
    expect(await counter()).toMatchObject({ id: c.id, status: stage === 'call' ? 'AVAILABLE' : 'OCCUPIED' });
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER issue19_reject_event ON queue_events');
    await db.$executeRawUnsafe('DROP FUNCTION issue19_reject_event()');
  }
});

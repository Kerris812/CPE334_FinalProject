import { createHash } from 'node:crypto';
import { PrismaClient, type EntryStatus } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { selectNextWaiting } from '../../src/queues/rules.js';
import { action, call, db, get, lab7Fixture, post, rejected, setup, snapshot, type Actor, type Lab7Fixture } from '../support/lab7-fixture.js';

let f: Lab7Fixture;
let g: Actor;
let h: Actor;
beforeAll(setup);
beforeEach(async () => { f = await lab7Fixture(); g = await f.assigned(); h = await f.assigned(); });
afterEach(async () => { await f.clean(); });
afterAll(() => db.$disconnect());
const events = (id: string) => db.queueEvent.findMany({ where: { entryId: id } });
async function entryAt(status: EntryStatus, queue = f.r, sequence = 1n) {
  const row = await f.entry(status, await f.actor(), queue, sequence);
  return db.queueEntry.update({ where: { id: row.id }, data: { partySize: queue.code === 'R' ? 4 : 5 } });
}
async function reachServing(queue = f.r) {
  const joined = await f.join(queue);
  expect((await call(queue.id, g)).status).toBe(200);
  expect((await action(joined.entry.id, 'start-service', h)).status).toBe(200);
  return joined;
}
async function endpoints(who: Actor | undefined, queue = f.r, entryId: string) {
  return [
    () => get('/operator/queues', who),
    () => get(`/operator/queues/${queue.id}/desk`, who),
    () => post(`/operator/queues/${queue.id}/call-next`, who),
    () => action(entryId, 'start-service', who),
    () => action(entryId, 'complete', who),
  ];
}

test('L7-005 generic assigned operators already support handoff without service ownership', async () => {
  for (const queue of [f.r, f.s]) {
    const { customer, entry } = await f.join(queue);
    expect((await call(queue.id, g)).status).toBe(200);
    expect((await action(entry.id, 'start-service', h)).status).toBe(200);
    expect((await action(entry.id, 'complete', g)).status).toBe(200);
    expect((await get(`/customer/entries/${entry.id}`, customer)).body.data.status).toBe('COMPLETED');
    expect((await events(entry.id)).map(e => [e.eventType, e.actorId])).toEqual([
      ['JOINED', customer.id], ['CALLED', g.id], ['STARTED', h.id], ['COMPLETED', g.id],
    ]);
  }
});
test('L7-006 customers remain forbidden even with forged operator and queue claims', async () => {
  for (const queue of [f.r, f.s]) {
    const { customer, entry } = await f.join(queue);
    for (const run of await endpoints(customer, queue, entry.id)) await rejected(run, 'FORBIDDEN', 403);
    for (const name of ['start-service', 'complete'] as const) await rejected(() => action(entry.id, name, customer, { role: 'OPERATOR', operatorId: g.id, queueId: queue.id }).set('operatorId', g.id).query({ role: 'OPERATOR' }), 'FORBIDDEN', 403);
  }
});
test('L7-007 genuinely unassigned and revoked operators remain denied by stored target queue', async () => {
  const u = await f.actor('OPERATOR');
  expect((await get('/operator/queues', u)).body.data).toEqual([]);
  for (const queue of [f.r, f.s]) {
    const { entry } = await f.join(queue);
    for (const run of (await endpoints(u, queue, entry.id)).slice(1)) await rejected(run, 'QUEUE_ACCESS_DENIED', 403);
  }
  await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId: h.id, queueId: f.s.id } } });
  const target = await db.queueEntry.findFirstOrThrow({ where: { queueId: f.s.id, status: 'WAITING' } });
  expect((await get('/operator/queues', h)).body.data.map((q: { code: string }) => q.code)).toEqual(['R']);
  for (const run of (await endpoints(h, f.s, target.id)).slice(1)) await rejected(run, 'QUEUE_ACCESS_DENIED', 403);
  await rejected(() => action(target.id, 'start-service', h, { operatorId: g.id, queueId: f.r.id }), 'QUEUE_ACCESS_DENIED', 403);
});
test('L7-008 assigned operators cannot start WAITING entries in either queue', async () => {
  for (const queue of [f.r, f.s]) {
    const { entry } = await f.join(queue);
    for (const who of [g, h]) await rejected(() => action(entry.id, 'start-service', who), 'INVALID_TRANSITION');
  }
});
test('L7-009 assigned operators cannot complete WAITING or CALLED entries', async () => {
  for (const queue of [f.r, f.s]) {
    const { entry } = await f.join(queue);
    for (const who of [g, h]) await rejected(() => action(entry.id, 'complete', who), 'INVALID_TRANSITION');
    expect((await call(queue.id, g)).status).toBe(200);
    for (const who of [g, h]) await rejected(() => action(entry.id, 'complete', who), 'INVALID_TRANSITION');
  }
});
test('L7-010 distinct assigned operators racing starts and completions have one winner and event', async () => {
  for (const queue of [f.r, f.s]) {
    const { entry } = await f.join(queue);
    expect((await call(queue.id, g)).status).toBe(200);
    for (const [name, eventType, to, stamp] of [['start-service', 'STARTED', 'SERVING', 'servingAt'], ['complete', 'COMPLETED', 'COMPLETED', 'completedAt']] as const) {
      const responses = await Promise.all([action(entry.id, name, g), action(entry.id, name, h)]);
      expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
      const winner = responses[0].status === 200 ? g : h;
      expect(responses.find(r => r.status === 409)?.body.error.code).toBe('INVALID_TRANSITION');
      const row = await db.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      const logged = (await events(entry.id)).filter(e => e.eventType === eventType);
      expect(row.status).toBe(to);
      expect(logged).toEqual([expect.objectContaining({ actorId: winner.id, toStatus: to, occurredAt: row[stamp] })]);
    }
    expect(await events(entry.id)).toHaveLength(4);
  }
});
test('L7-011 twenty mixed-operator calls preserve one FIFO head and one audit event per queue', async () => {
  for (const queue of [f.r, f.s]) {
    const head = await f.join(queue);
    const next = await f.join(queue);
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => call(queue.id, i % 2 ? h : g)));
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.filter(r => r.status === 409 && r.body.error.code === 'SERVICE_SLOT_BUSY')).toHaveLength(19);
    const index = responses.findIndex(r => r.status === 200);
    expect(responses[index].body.data.id).toBe(head.entry.id);
    expect((await db.queueEntry.findUniqueOrThrow({ where: { id: next.entry.id } })).status).toBe('WAITING');
    expect((await events(head.entry.id)).filter(e => e.eventType === 'CALLED')).toEqual([expect.objectContaining({ actorId: index % 2 ? h.id : g.id })]);
    expect(await db.queueEntry.count({ where: { queueId: queue.id, status: { in: ['CALLED', 'SERVING'] } } })).toBe(1);
  }
});
test('L7-012 each handoff audit actor comes from its session despite forged previous actors', async () => {
  for (const [queue, actors] of [[f.r, [g, h, g]], [f.s, [h, g, h]]] as const) {
    const { customer, entry } = await f.join(queue);
    await rejected(() => post(`/operator/queues/${queue.id}/call-next`, actors[0], { operatorId: actors[1].id }), 'VALIDATION_ERROR', 422);
    const called = await call(queue.id, actors[0]);
    expect(called.status).toBe(200);
    const started = await action(entry.id, 'start-service', actors[1], { operatorId: actors[0].id });
    const completed = await action(entry.id, 'complete', actors[2], { operatorId: actors[1].id });
    expect(started.status).toBe(200);
    expect(completed.status).toBe(200);
    const logged = await events(entry.id);
    expect(logged).toHaveLength(4);
    const tuples = [['JOINED', customer.id, null, 'WAITING'], ['CALLED', actors[0].id, 'WAITING', 'CALLED'], ['STARTED', actors[1].id, 'CALLED', 'SERVING'], ['COMPLETED', actors[2].id, 'SERVING', 'COMPLETED']];
    for (const [eventType, actorId, fromStatus, toStatus] of tuples) expect(logged.find(e => e.eventType === eventType)).toMatchObject({ actorId, fromStatus, toStatus });
    for (const [eventType, response, stamp] of [['CALLED', called, 'calledAt'], ['STARTED', started, 'servingAt'], ['COMPLETED', completed, 'completedAt']] as const) expect(logged.find(e => e.eventType === eventType)?.occurredAt.toISOString()).toBe(response.body.data[stamp]);
  }
});
test('L7-013 FIFO uses immutable sequence despite insertion time, client order and operator choice', async () => {
  for (const queue of [f.r, f.s]) {
    const rows = [];
    for (const sequence of [3n, 1n, 2n]) {
      const row = await entryAt('WAITING', queue, sequence);
      rows.push(await db.queueEntry.update({ where: { id: row.id }, data: { joinedAt: new Date(Number(4n - sequence) * 1000) } }));
    }
    expect(selectNextWaiting(rows)?.sequence).toBe(1n);
    for (const [i, sequence] of [1n, 2n, 3n].entries()) {
      const row = rows.find(e => e.sequence === sequence)!;
      expect((await call(queue.id, i % 2 ? h : g)).body.data.id).toBe(row.id);
      expect((await action(row.id, 'start-service', h)).status).toBe(200);
      expect((await action(row.id, 'complete', g)).status).toBe(200);
      const persisted = await db.queueEntry.findUniqueOrThrow({ where: { id: row.id } });
      expect([persisted.queueId, persisted.sequence, persisted.displayNumber]).toEqual([row.queueId, row.sequence, row.displayNumber]);
    }
    await expect(db.queueEntry.update({ where: { id: rows[0].id }, data: { sequence: 99n } })).rejects.toThrow();
  }
});
test('L7-014 exact routing boundaries and invalid JSON values preserve all rejected join state', async () => {
  for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const queue = size <= 4 ? f.r : f.s;
    const { entry } = await f.join(queue, size);
    expect(entry).toMatchObject({ queueId: queue.id, partySize: size, status: 'WAITING' });
    expect(entry.displayNumber.startsWith(`${queue.code}-`)).toBe(true);
  }
  const customer = await f.actor();
  const bodies: unknown[] = [0, 9, -1, 1.5, '3', null, true].map(partySize => ({ partySize }));
  bodies.push({}, [], 5);
  for (const body of bodies) {
    const response = await rejected(() => post(`/queues/${f.r.id}/entries`, customer, body), 'VALIDATION_ERROR', 422);
    expect(response.body.error.details.fields.partySize).toBeTruthy();
  }
  const unknown = await rejected(() => post(`/queues/${f.r.id}/entries`, customer, { partySize: 4, operatorId: g.id }), 'VALIDATION_ERROR', 422);
  expect(unknown.body.error.details.fields.form).toBeTruthy();
  for (const [queue, sizes] of [[f.r, [5, 8]], [f.s, [1, 4]]] as const) {
    for (const partySize of sizes) await rejected(() => post(`/queues/${queue.id}/entries`, customer, { partySize }), 'VALIDATION_ERROR', 422);
    for (const state of ['PAUSED', 'CLOSED'] as const) {
      await db.queue.update({ where: { id: queue.id }, data: { state } });
      await rejected(() => post(`/queues/${queue.id}/entries`, customer, { partySize: queue.code === 'R' ? 4 : 5 }), 'QUEUE_NOT_OPEN');
    }
  }
});
test('L7-015 CALLED and SERVING share one slot while the other queue remains independently callable', async () => {
  const first = await f.join();
  await f.join();
  const sHead = await f.join(f.s);
  expect((await call(f.r.id, g)).status).toBe(200);
  for (const who of [g, h]) await rejected(() => call(f.r.id, who), 'SERVICE_SLOT_BUSY');
  expect((await action(first.entry.id, 'start-service', h)).status).toBe(200);
  for (const who of [g, h]) await rejected(() => call(f.r.id, who), 'SERVICE_SLOT_BUSY');
  expect((await call(f.s.id, h)).body.data.id).toBe(sHead.entry.id);
  const other = await f.actor();
  const before = await snapshot();
  await expect(db.queueEntry.create({ data: { queueId: f.r.id, customerId: other.id, sequence: 999n, displayNumber: 'R-0999', partySize: 4, status: 'CALLED', counterId: f.counterId } })).rejects.toMatchObject({ code: 'P2002' });
  expect(await snapshot()).toEqual(before);
  expect((await action(first.entry.id, 'complete', g)).status).toBe(200);
  expect((await call(f.r.id, h)).status).toBe(200);
});
for (const mode of ['anonymous', 'expired', 'revoked', 'inactive'] as const) {
  test(`L7-016 ${mode} sessions cannot read or mutate any protected operator endpoint`, async () => {
    const { entry } = await f.join();
    const token = g.cookie.slice('qs_session='.length);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    if (mode === 'expired') await db.session.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
    if (mode === 'revoked') await db.session.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
    if (mode === 'inactive') await db.user.update({ where: { id: g.id }, data: { isActive: false } });
    for (const run of await endpoints(mode === 'anonymous' ? undefined : g, f.r, entry.id)) await rejected(run, 'UNAUTHENTICATED', 401);
  });
}
test('L7-016 customer isolation, duplicate-active prevention, exact public DTO and reconnect persistence remain', async () => {
  const { customer, entry } = await f.join();
  const stranger = await f.actor();
  await rejected(() => post(`/queues/${f.s.id}/entries`, customer, { partySize: 5 }), 'DUPLICATE_ACTIVE_ENTRY');
  await rejected(() => get(`/customer/entries/${entry.id}`, stranger), 'ENTRY_NOT_FOUND', 404);
  expect((await call(f.r.id, g)).status).toBe(200);
  const board = await get(`/public/queues/${f.r.id}/board`);
  expect(board.body.data).toEqual({ queueCode: 'R', calledNumber: entry.displayNumber, serviceState: 'CALLED', waitingCount: 0 });
  expect((await action(entry.id, 'start-service', h)).status).toBe(200);
  expect((await action(entry.id, 'complete', g)).status).toBe(200);
  const before = await snapshot();
  const reconnect = new PrismaClient();
  try { expect(await reconnect.queueEntry.findUnique({ where: { id: entry.id } })).toEqual(before.entries.find(e => e.id === entry.id)); }
  finally { await reconnect.$disconnect(); }
  await seed(db);
  expect(await snapshot()).toEqual(before);
  const again = await f.join(f.r, 4, customer);
  expect(again.entry.sequence).toBe(entry.sequence + 1);
});
test('L7-017 unexpected seeded assignments outside R/S fail atomically and preserve the actual assignment', async () => {
  const a = await f.seeded('a');
  const outside = await f.newQueue();
  await db.operatorQueueAssignment.create({ data: { operatorId: a.id, queueId: outside.id } });
  try {
    const before = await snapshot();
    await expect(seed(db)).rejects.toThrow(/assignment/i);
    expect(await snapshot()).toEqual(before);
  } finally { await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId: a.id, queueId: outside.id } } }); }
});
test('L7-018 terminal and repeated transitions are immutable; historical routing is not reinterpreted', async () => {
  for (const queue of [f.r, f.s]) {
    for (const [index, status] of (['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const).entries()) {
      const row = await entryAt(status, queue, BigInt(index + 10));
      for (const who of [g, h]) for (const name of ['start-service', 'complete'] as const) await rejected(() => action(row.id, name, who), 'INVALID_TRANSITION');
    }
    await rejected(() => call(queue.id, g), 'QUEUE_EMPTY');
    const row = await entryAt('WAITING', queue, 20n);
    await db.queueEntry.update({ where: { id: row.id }, data: { partySize: queue.code === 'R' ? 8 : 1 } });
    expect((await call(queue.id, h)).status).toBe(200);
    expect((await action(row.id, 'start-service', g)).status).toBe(200);
    await rejected(() => action(row.id, 'start-service', h), 'INVALID_TRANSITION');
    expect((await action(row.id, 'complete', h)).status).toBe(200);
    await rejected(() => action(row.id, 'complete', g), 'INVALID_TRANSITION');
    expect((await db.queueEntry.findUniqueOrThrow({ where: { id: row.id } })).partySize).toBe(queue.code === 'R' ? 8 : 1);
  }
});
test('L7-019 holding R queue row lock does not block an independently authorized S call', async () => {
  const { entry } = await f.join(f.s);
  let ready!: () => void;
  let release!: () => void;
  const locked = new Promise<void>(resolve => { ready = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const holding = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM queues WHERE id = ${f.r.id}::uuid FOR UPDATE`; ready(); await gate; }, { timeout: 10000 });
  try {
    await locked;
    const response = await call(f.s.id, h).timeout({ deadline: 3000 });
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(entry.id);
  } finally { release(); await holding; }
});
test('L7-020 event insert failure rolls back every action for either assigned operator, and retry records once', async () => {
  await db.$executeRawUnsafe("CREATE FUNCTION lab7_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Lab 7 isolated audit failure'; END $$");
  await db.$executeRawUnsafe(`CREATE TRIGGER lab7_reject_event BEFORE INSERT ON queue_events FOR EACH ROW WHEN (NEW.actor_id IN ('${g.id}'::uuid, '${h.id}'::uuid)) EXECUTE FUNCTION lab7_reject_event()`);
  try {
    for (const who of [g, h]) {
      const row = await entryAt('WAITING', f.r, who.id === g.id ? 1n : 2n);
      await rejected(() => call(f.r.id, who), 'INTERNAL_ERROR', 500);
      await db.queueEntry.update({ where: { id: row.id }, data: { status: 'CALLED', counterId: f.counterId } });
      await rejected(() => action(row.id, 'start-service', who), 'INTERNAL_ERROR', 500);
      await db.queueEntry.update({ where: { id: row.id }, data: { status: 'SERVING' } });
      await rejected(() => action(row.id, 'complete', who), 'INTERNAL_ERROR', 500);
      await db.queueEntry.update({ where: { id: row.id }, data: { status: 'COMPLETED' } });
    }
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER lab7_reject_event ON queue_events');
    await db.$executeRawUnsafe('DROP FUNCTION lab7_reject_event()');
  }
  await db.queue.update({ where: { id: f.r.id }, data: { lastSequence: 2n } });
  const { entry } = await reachServing();
  expect((await action(entry.id, 'complete', g)).status).toBe(200);
  expect(await events(entry.id)).toHaveLength(4);
});

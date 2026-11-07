import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { seed } from '../../prisma/seed.js';
import { db, setup, fixture, origin, type Fixture } from '../support/queue-fixture.js';
const app = createApp({ db, webOrigin: origin });
let f: Fixture;
const sessionIds: string[] = [];
beforeAll(setup); beforeEach(async () => { f = await fixture(); });
afterEach(async () => { await db.session.deleteMany({ where: { id: { in: sessionIds.splice(0) } } }); await f.clean(); }); afterAll(() => db.$disconnect());
async function operator(letter: 'a' | 'b') {
  const user = await db.user.findUniqueOrThrow({ where: { email: `operator.${letter}@example.test` } });
  const token = randomBytes(32).toString('base64url'); const row = await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } }); sessionIds.push(row.id); return { id: user.id, cookie: `qs_session=${token}` };
}
const join = (queueId: string, size: number, who = f.customer) => request(app).post(`/api/v1/queues/${queueId}/entries`).set('Cookie', who.cookie).set('Origin', origin).send({ partySize: size });
const call = (queueId: string, who: { cookie: string }) => request(app).post(`/api/v1/operator/queues/${queueId}/call-next`).set('Cookie', who.cookie).set('Origin', origin).send({});
const action = (entryId: string, name: string, who: { cookie: string }) => request(app).post(`/api/v1/operator/entries/${entryId}/${name}`).set('Cookie', who.cookie).set('Origin', origin).send({});
async function unchanged(run: () => PromiseLike<request.Response>, status: number, code: string) { const before = await f.state(); const r = await run(); expect(r.status).toBe(status); expect(r.body.error.code).toBe(code); expect(await f.state()).toEqual(before); }
test('TEST-053 seed adds both designated queues and assignments without changing existing records', async () => {
  const entry = await f.entry('COMPLETED'); const before = { users: await db.user.findMany({ orderBy: { id: 'asc' } }), sessions: await db.session.findMany({ orderBy: { id: 'asc' } }), entry: await db.queueEntry.findUnique({ where: { id: entry.id } }), events: await db.queueEvent.findMany() };
  await seed(db); await seed(db);
  expect(await db.queue.findMany({ where: { code: { in: ['R', 'S'] } }, select: { code: true, state: true }, orderBy: { code: 'asc' } })).toEqual([{ code: 'R', state: 'OPEN' }, { code: 'S', state: 'OPEN' }]);
  for (const [letter, code] of [['a', 'R'], ['b', 'S']] as const) { const user = await db.user.findUniqueOrThrow({ where: { email: `operator.${letter}@example.test` } }); const rows = await db.operatorQueueAssignment.findMany({ where: { operatorId: user.id }, include: { queue: true } }); expect(rows.map(r => r.queue.code)).toEqual([code]); }
  expect({ users: await db.user.findMany({ orderBy: { id: 'asc' } }), sessions: await db.session.findMany({ orderBy: { id: 'asc' } }), entry: await db.queueEntry.findUnique({ where: { id: entry.id } }), events: await db.queueEvent.findMany() }).toEqual(before);
});
test('TEST-054 R rejects large parties and unsupported queues reject new joins without writes', async () => { await unchanged(() => join(f.queue.id, 5), 422, 'VALIDATION_ERROR'); const other = await f.newQueue(); await unchanged(() => join(other.id, 4), 422, 'VALIDATION_ERROR'); });
test('TEST-054 sizes 1/4 join R and 5/8 join S; both queue mismatches and invalid sizes preserve state', async () => {
  const s = await f.useS();
  for (const [size, queue] of [[1, f.queue], [4, f.queue], [5, s], [8, s]] as const) { const who = await f.actor(); const r = await join(queue.id, size, who); expect(r.status).toBe(201); expect(r.body.data).toMatchObject({ queueId: queue.id, partySize: size, status: 'WAITING' }); expect(r.body.data.displayNumber.startsWith(queue.code + '-')).toBe(true); }
  for (const [queue, sizes] of [[f.queue, [5, 8]], [s, [1, 4]]] as const) for (const size of sizes) await unchanged(() => join(queue.id, size), 422, 'VALIDATION_ERROR');
  for (const size of [0, 9]) await unchanged(() => join(f.queue.id, size), 422, 'VALIDATION_ERROR');
});
test('TEST-054 both queues reject joins while unavailable and a customer race across R/S commits once', async () => {
  const s = await f.useS();
  for (const [queue, size] of [[f.queue, 4], [s, 5]] as const) { for (const state of ['PAUSED', 'CLOSED'] as const) { await db.queue.update({ where: { id: queue.id }, data: { state } }); await unchanged(() => join(queue.id, size), 409, 'QUEUE_NOT_OPEN'); } await db.queue.update({ where: { id: queue.id }, data: { state: 'OPEN' } }); }
  const rs = await Promise.all([join(f.queue.id, 4), join(s.id, 5)]); expect(rs.map(r => r.status).sort()).toEqual([201, 409]); expect(rs.find(r => r.status === 409)?.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY'); const snapshot = await f.state(); expect(snapshot.entries).toHaveLength(1); expect(snapshot.events).toHaveLength(1); expect(snapshot.queues.reduce((n, q) => n + q.lastSequence, 0n)).toBe(1n);
});
test('TEST-055 A lists and manages only R; B only S, including forged identities', async () => {
  const s = await f.useS(); const a = await operator('a'); const b = await operator('b');
  const rEntry = await f.entry(); const sEntry = await f.entry('WAITING', await f.actor(), s);
  for (const [who, own, foreign, foreignEntry, other] of [[a, f.queue, s, sEntry, b], [b, s, f.queue, rEntry, a]] as const) {
    const list = await request(app).get('/api/v1/operator/queues').set('Cookie', who.cookie); expect(list.body.data.map((q: { code: string }) => q.code)).toEqual([own.code]);
    expect((await request(app).get(`/api/v1/operator/queues/${own.id}/desk`).set('Cookie', who.cookie)).status).toBe(200);
    await unchanged(() => request(app).get(`/api/v1/operator/queues/${foreign.id}/desk`).set('Cookie', who.cookie), 403, 'QUEUE_ACCESS_DENIED');
    await unchanged(() => call(foreign.id, who), 403, 'QUEUE_ACCESS_DENIED');
    for (const name of ['start-service', 'complete']) await unchanged(() => action(foreignEntry.id, name, who).send({ operatorId: other.id, queueId: own.id }), 403, 'QUEUE_ACCESS_DENIED');
  }
});
test('TEST-056 independent FIFO and forty simultaneous calls create one active slot and audit per queue', async () => {
  const s = await f.useS(); const a = await operator('a'); const b = await operator('b');
  const heads = [];
  for (const queue of [f.queue, s]) { for (const sequence of [3n, 1n, 2n]) { const entry = await f.entry('WAITING', await f.actor(), queue, sequence); if (sequence === 1n) heads.push(entry); } }
  const results = await Promise.all([Promise.all(Array.from({ length: 20 }, () => call(f.queue.id, a))), Promise.all(Array.from({ length: 20 }, () => call(s.id, b)))]);
  for (let i = 0; i < 2; i++) { const rs = results[i]; expect(rs.filter(r => r.status === 200)).toHaveLength(1); expect(rs.filter(r => r.status === 409 && r.body.error.code === 'SERVICE_SLOT_BUSY')).toHaveLength(19); expect(rs.find(r => r.status === 200)!.body.data.id).toBe(heads[i].id); }
  for (const [head, who] of [[heads[0], a], [heads[1], b]] as const) { expect((await action(head.id, 'start-service', who)).status).toBe(200); expect((await action(head.id, 'complete', who)).status).toBe(200); await unchanged(() => action(head.id, 'complete', who), 409, 'INVALID_TRANSITION'); const events = await db.queueEvent.findMany({ where: { entryId: head.id }, orderBy: { occurredAt: 'asc' } }); expect(events.map(e => [e.eventType, e.actorId])).toEqual([['CALLED', who.id], ['STARTED', who.id], ['COMPLETED', who.id]]); }
  expect(await db.queueEntry.count({ where: { queueId: { in: [f.queue.id, s.id] }, status: { in: ['CALLED', 'SERVING'] } } })).toBe(0);
});
test('TEST-056 holding R row lock does not prevent S from calling', async () => {
  const s = await f.useS(); const b = await operator('b'); await f.entry('WAITING', f.customer, s);
  let release!: () => void; let locked!: () => void; const lockReady = new Promise<void>(r => { locked = r; }); const gate = new Promise<void>(r => { release = r; });
  const holding = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM queues WHERE id = ${f.queue.id}::uuid FOR UPDATE`; locked(); await gate; }, { timeout: 10000 });
  try { await lockReady; const response = await call(s.id, b).timeout({ deadline: 3000 }); expect(response.status).toBe(200); } finally { release(); await holding; }
});
test('TEST-053 seed preserves paused states and counters; contradictory assignment fails atomically', async () => {
  const s = await f.useS(); const a = await operator('a');
  await db.queue.update({ where: { id: s.id }, data: { state: 'PAUSED', lastSequence: 99n } }); const before = await f.state(); await seed(db); expect(await f.state()).toEqual(before);
  await db.operatorQueueAssignment.create({ data: { operatorId: a.id, queueId: s.id } });
  try { const assignments = await db.operatorQueueAssignment.findMany({ orderBy: [{ operatorId: 'asc' }, { queueId: 'asc' }] }); await expect(seed(db)).rejects.toThrow(/assignment/i); expect(await f.state()).toEqual(before); expect(await db.operatorQueueAssignment.findMany({ orderBy: [{ operatorId: 'asc' }, { queueId: 'asc' }] })).toEqual(assignments); }
  finally { await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId: a.id, queueId: s.id } } }); }
});

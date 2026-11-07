import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { db, setup, fixture, origin, type Fixture } from '../support/queue-fixture.js';
import { assertPublicBoard } from '../support/public-board-assertions.js';
const app = createApp({ db, webOrigin: origin }); let f: Fixture;
beforeAll(setup); beforeEach(async () => { f = await fixture(); }); afterEach(() => f.clean()); afterAll(() => db.$disconnect());
async function board(cookie?: string) {
  const pending = request(app).get(`/api/v1/public/queues/${f.queue.id}/board`);
  const response = await (cookie ? pending.set('Cookie', cookie) : pending);
  expect(response.status).toBe(200); assertPublicBoard(response.body); return response;
}
test('TEST-028 anonymous board recursively exposes exactly four approved primitive fields', async () => {
  const called = await f.entry('CALLED'); await f.entry('WAITING', await f.actor(), f.queue, 2n);
  const before = await f.state();
  for (const cookie of [undefined, 'qs_session=malformed']) {
    const response = await board(cookie);
    expect(response.body).toEqual({ data: { queueCode: f.queue.code, calledNumber: called.displayNumber, serviceState: 'CALLED', waitingCount: 1 } });
    expect(response.headers['cache-control']).toContain('no-store'); expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect(await f.state()).toEqual(before);
});
test('TEST-029 CALLED to SERVING, waiting changes, completion and empty queues reflect PostgreSQL', async () => {
  expect((await board()).body.data).toEqual({ queueCode: f.queue.code, calledNumber: null, serviceState: null, waitingCount: 0 });
  const current = await f.entry('CALLED'); const waiting = await f.entry('WAITING', await f.actor(), f.queue, 2n);
  const foreignQueue = await f.newQueue(); await f.entry('CALLED', await f.actor(), foreignQueue); await f.entry('WAITING', await f.actor(), foreignQueue, 2n);
  expect((await board()).body.data).toEqual({ queueCode: f.queue.code, calledNumber: current.displayNumber, serviceState: 'CALLED', waitingCount: 1 });
  await db.queueEntry.update({ where: { id: current.id }, data: { status: 'SERVING' } });
  await f.entry('WAITING', await f.actor(), f.queue, 3n);
  expect((await board()).body.data).toEqual({ queueCode: f.queue.code, calledNumber: current.displayNumber, serviceState: 'SERVING', waitingCount: 2 });
  await db.queueEntry.update({ where: { id: current.id }, data: { status: 'COMPLETED' } });
  expect((await board()).body.data).toEqual({ queueCode: f.queue.code, calledNumber: null, serviceState: null, waitingCount: 2 });
  await db.queueEntry.update({ where: { id: waiting.id }, data: { status: 'CALLED' } });
  expect((await board()).body.data).toEqual({ queueCode: f.queue.code, calledNumber: waiting.displayNumber, serviceState: 'CALLED', waitingCount: 1 });
});
test('TEST-031 deeply related customer, session, entry and audit data cannot leak through public JSON', async () => {
  const current = await f.entry('CALLED'); const waiting = await f.entry('WAITING', await f.actor(), f.queue, 2n);
  const privateReason = `Private audit ${randomUUID()}`;
  await db.queueEvent.create({ data: { entryId: current.id, actorId: f.customer.id, eventType: 'JOINED', toStatus: 'CALLED', reason: privateReason } });
  const privateGraph = await db.queueEntry.findUniqueOrThrow({ where: { id: current.id }, include: { customer: { include: { sessions: true } }, events: { include: { actor: true } } } });
  const before = await f.state();
  const response = await request(app).get(`/api/v1/public/queues/${f.queue.id}/board`).query({ include: 'customer,sessions,events', customerId: waiting.customerId }).set('X-Role', 'OPERATOR').set('Cookie', f.customer.cookie);
  expect(response.status).toBe(200); assertPublicBoard(response.body);
  const serialized = JSON.stringify(response.body);
  for (const value of [f.customer.id, current.id, waiting.id, privateGraph.customer.email, privateGraph.customer.displayName, privateGraph.customer.passwordHash, privateReason, privateGraph.joinedAt.toISOString(), ...privateGraph.customer.sessions.map(row => row.tokenHash)]) expect(serialized.includes(value)).toBe(false);
  expect(await f.state()).toEqual(before);
});
test('public board unknown IDs share safe 404s and do not reveal private resource values', async () => {
  const bodies: unknown[] = [];
  for (const id of [randomUUID(), 'invalid', f.customer.id]) {
    const response = await request(app).get(`/api/v1/public/queues/${id}/board`);
    expect(response.status).toBe(404); expect(response.body.error).toEqual({ code: 'QUEUE_NOT_FOUND', message: 'Queue not found.', requestId: expect.any(String) });
    bodies.push({ ...response.body.error, requestId: 'request-id' });
  }
  expect(bodies[0]).toEqual(bodies[1]); expect(bodies[1]).toEqual(bodies[2]);
});
test('seeded public code R resolves to the same safe board as its database ID without login', async () => {
  await f.useR();
  const canonical = await request(app).get(`/api/v1/public/queues/${f.queue.id}/board`);
  const byCode = await request(app).get('/api/v1/public/queues/R/board');
  expect(byCode.status).toBe(200); assertPublicBoard(byCode.body);
  expect(byCode.body).toEqual(canonical.body); expect(byCode.body.data.queueCode).toBe('R');
  expect(byCode.headers['set-cookie']).toBeUndefined();
});

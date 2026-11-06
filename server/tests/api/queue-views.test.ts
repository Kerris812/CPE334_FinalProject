import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { db, setup, fixture, origin, type Fixture } from '../support/queue-fixture.js';
let f: Fixture; const app = createApp({ db, webOrigin: origin });
beforeAll(setup); beforeEach(async () => { f = await fixture(); }); afterEach(() => f.clean()); afterAll(() => db.$disconnect());
const latest = () => request(app).get('/api/v1/customer/entries/latest').set('Cookie', f.customer.cookie);
const board = () => request(app).get(`/api/v1/public/queues/${f.queue.id}/board`);
const detail = (id: string, cookie = f.customer.cookie) => request(app).get(`/api/v1/customer/entries/${id}`).set('Cookie', cookie);
function privateShape(response: request.Response, number: string) {
  expect(response.status).toBe(200); expect(response.body.data.displayNumber).toBe(number);
  expect(Object.keys(response.body.data).sort()).toEqual(['id', 'queueCode', 'displayNumber', 'partySize', 'status', 'joinedAt', 'calledAt', 'servingAt', 'completedAt'].sort());
}
test('TEST-025 latest and own detail expose only persisted private DTO including COMPLETED', async () => {
  expect((await latest()).body).toEqual({ data: null });
  const entry = await f.entry(); const read = await latest(); privateShape(read, entry.displayNumber); expect((await detail(entry.id)).body).toEqual(read.body);
  await db.queueEntry.update({ where: { id: entry.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  expect((await latest()).body.data.status).toBe('COMPLETED'); expect((await detail(entry.id)).body.data.status).toBe('COMPLETED');
});
test('TEST-026 foreign, missing and malformed entry IDs return indistinguishable safe 404s', async () => {
  const entry = await f.entry('COMPLETED', await f.actor());
  const normalized: unknown[] = [];
  for (const id of [entry.id, randomUUID(), 'invalid']) {
    const response = await detail(id).query({ customerId: entry.customerId }).set('customerId', entry.customerId);
    expect(response.status).toBe(404); expect(response.body.error.code).toBe('ENTRY_NOT_FOUND');
    expect(JSON.stringify(response.body).includes(entry.customerId)).toBe(false); normalized.push({ ...response.body.error, requestId: 'redacted' });
  }
  expect(normalized[0]).toEqual(normalized[1]); expect(normalized[1]).toEqual(normalized[2]);
});
test('TEST-027 anonymous and operator requests cannot read private customer routes', async () => {
  const entry = await f.entry(); const operator = await f.actor('OPERATOR');
  for (const [cookie, status] of [['', 401], [operator.cookie, 403]] as const) for (const id of ['latest', entry.id]) {
    const response = await detail(id, cookie); expect(response.status).toBe(status); expect(response.body.error.code).toBe(status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  }
});
test('TEST-028 anonymous board returns exact four-field allowlist and WAITING-only count', async () => {
  const called = await f.entry('CALLED'); await f.entry('WAITING', await f.actor(), f.queue, 2n); await f.entry('WAITING', await f.actor(), f.queue, 3n);
  const response = await board(); expect(response.status).toBe(200); expect(response.headers['cache-control']).toContain('no-store');
  expect(response.body).toEqual({ data: { queueCode: f.queue.code, calledNumber: called.displayNumber, serviceState: 'CALLED', waitingCount: 2 } });
});
test('TEST-029 board reflects CALLED/SERVING fixtures and nulls the completed service slot', async () => {
  expect((await board()).body).toEqual({ data: { queueCode: f.queue.code, calledNumber: null, serviceState: null, waitingCount: 0 } });
  const entry = await f.entry('CALLED'); await f.entry('WAITING', await f.actor(), f.queue, 2n);
  for (const status of ['CALLED', 'SERVING', 'COMPLETED'] as const) {
    await db.queueEntry.update({ where: { id: entry.id }, data: { status } });
    expect((await board()).body).toEqual({ data: { queueCode: f.queue.code, calledNumber: status === 'COMPLETED' ? null : entry.displayNumber, serviceState: status === 'COMPLETED' ? null : status, waitingCount: 1 } });
  }
});
test('TEST-031 public board never serializes nested private account, entry or event fields', async () => {
  const entry = await f.entry('CALLED');
  await db.queueEvent.create({ data: { entryId: entry.id, actorId: f.customer.id, eventType: 'JOINED', toStatus: 'CALLED', reason: 'Private fixture detail' } });
  const response = await board(); expect(response.status).toBe(200);
  expect(Object.keys(response.body.data).sort()).toEqual(['calledNumber', 'queueCode', 'serviceState', 'waitingCount']);
  const serialized = JSON.stringify(response.body);
  for (const value of [f.customer.id, entry.id, 'Private fixture detail', 'customerId', 'email', 'passwordHash', 'partySize', 'joinedAt', 'events', 'actorId']) expect(serialized.includes(value)).toBe(false);
});
test('unknown and malformed public queue IDs return safe QUEUE_NOT_FOUND', async () => {
  for (const id of [randomUUID(), 'invalid']) { const response = await request(app).get(`/api/v1/public/queues/${id}/board`); expect(response.status).toBe(404); expect(response.body.error.code).toBe('QUEUE_NOT_FOUND'); }
});

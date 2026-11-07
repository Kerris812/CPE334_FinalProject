// Test-only routes prove guard composition before the queue workflow endpoints exist.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { requireAuthentication } from '../../src/auth/session.js';
import { requireRole, requireQueueAssignment, requireEntryAssignment, requireOwnedEntry } from '../../src/authorization/guards.js';
import { ApiError, sendError } from '../../src/http/errors.js';
import { createApp } from '../../src/app.js';
import { seed } from '../../prisma/seed.js';

const db = new PrismaClient();
const sessions: string[] = [];
let queueId: string;
let entryId: string;
let customerId: string;
let operatorId: string;
let customerCookie: string;
let ownerCookie: string;
let assignedCookie: string;
let unassignedCookie: string;
const fixture = express();
fixture.use(express.json(), requireAuthentication(db));
fixture.get('/owned/:entryId', requireRole('CUSTOMER'), requireOwnedEntry(db), (_req, res) => res.status(204).end());
fixture.get('/queue/:queueId', requireRole('OPERATOR'), requireQueueAssignment(db), (_req, res) => res.status(204).end());
fixture.post('/action/:entryId', requireRole('OPERATOR'), requireEntryAssignment(db), async (_req, res) => {
  // Deliberate test-only DB write: a denied request must never reach this handler.
  await db.queue.update({ where: { id: queueId }, data: { lastSequence: { increment: 1 } } });
  res.status(204).end();
});
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  sendError(res, error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'));
};
fixture.use(errors);
async function session(email: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString('base64url');
  const row = await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
  sessions.push(row.id);
  return `qs_session=${token}`;
}
const safeError = (response: request.Response) => ({ ...response.body.error, requestId: '<request-id>' });
beforeAll(async () => {
  await seed(db);
  queueId = (await db.queue.findUniqueOrThrow({ where: { code: 'R' } })).id;
  customerId = (await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } })).id;
  operatorId = (await db.user.findUniqueOrThrow({ where: { email: 'operator.a@example.test' } })).id;
  const owner = await db.user.findUniqueOrThrow({ where: { email: 'customer.b@example.test' } });
  entryId = (await db.queueEntry.create({ data: { queueId, customerId: owner.id, sequence: 700002n, displayNumber: `AUTH-${randomUUID().slice(0, 20)}`, partySize: 4, status: 'COMPLETED' } })).id;
  customerCookie = await session('customer.a@example.test');
  ownerCookie = await session('customer.b@example.test');
  assignedCookie = await session('operator.a@example.test');
  unassignedCookie = await session('operator.b@example.test');
});
afterAll(async () => {
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  if (entryId) await db.queueEntry.delete({ where: { id: entryId } });
  await db.$disconnect();
});

test('ownership guard allows owner and gives identical foreign/missing/invalid 404s despite forged identity', async () => {
  expect((await request(fixture).get(`/owned/${entryId}`).set('Cookie', ownerCookie)).status).toBe(204);
  const entry = await db.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
  const foreign = await request(fixture).get(`/owned/${entryId}`).set('Cookie', customerCookie).set('customerId', entry.customerId).query({ customerId: entry.customerId, role: 'CUSTOMER' }).send({ customerId: entry.customerId, role: 'CUSTOMER' });
  const missing = await request(fixture).get(`/owned/${randomUUID()}`).set('Cookie', customerCookie);
  const invalid = await request(fixture).get('/owned/not-a-uuid').set('Cookie', customerCookie);
  for (const response of [foreign, missing, invalid]) {
    expect(response.status).toBe(404);
    expect(safeError(response)).toEqual({ code: 'ENTRY_NOT_FOUND', message: 'Queue entry not found.', requestId: '<request-id>' });
  }
  expect((await request(fixture).get(`/owned/${entryId}`).set('Cookie', assignedCookie)).status).toBe(403);
  expect(await db.queueEntry.findUniqueOrThrow({ where: { id: entryId } })).toEqual(entry);
});

test('assignment guards permit assigned operator and block writes by customers and unassigned operators', async () => {
  expect((await request(fixture).get(`/queue/${queueId}`).set('Cookie', assignedCookie)).status).toBe(204);
  const before = await db.queue.findUniqueOrThrow({ where: { id: queueId } });
  const events = await db.queueEvent.count();
  try {
    for (const cookie of [customerCookie, unassignedCookie]) {
      const response = await request(fixture).post(`/action/${entryId}`).set('Cookie', cookie).send({ operatorId, queueId });
      expect(response.status).toBe(403);
      expect(await db.queue.findUniqueOrThrow({ where: { id: queueId } })).toEqual(before);
      expect(await db.queueEvent.count()).toBe(events);
    }
    expect((await request(fixture).post(`/action/${entryId}`).set('Cookie', assignedCookie).send({ queueId: randomUUID() })).status).toBe(204);
    expect((await db.queue.findUniqueOrThrow({ where: { id: queueId } })).lastSequence).toBe(before.lastSequence + 1n);
  } finally { await db.queue.update({ where: { id: queueId }, data: { lastSequence: before.lastSequence } }); }
});

test('existing sessions reflect assignment removal, changed database roles and disabled users immediately', async () => {
  const app = createApp({ db });
  const user = await db.user.findUniqueOrThrow({ where: { id: operatorId } });
  const originalList = await request(app).get('/api/v1/operator/queues').set('Cookie', assignedCookie);
  const temporaryQueue = await db.queue.create({ data: { code: `T${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`, name: 'Authorization test queue' } });
  try {
    await db.operatorQueueAssignment.create({ data: { operatorId, queueId: temporaryQueue.id } });
    expect((await request(fixture).get(`/queue/${temporaryQueue.id}`).set('Cookie', assignedCookie)).status).toBe(204);
    // Remove only the assignment this test created; never delete the seeded R assignment.
    await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId, queueId: temporaryQueue.id } } });
    expect((await request(fixture).get(`/queue/${temporaryQueue.id}`).set('Cookie', assignedCookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/operator/queues').set('Cookie', assignedCookie)).body).toEqual(originalList.body);
    await db.user.update({ where: { id: operatorId }, data: { role: 'CUSTOMER' } });
    expect((await request(app).get('/api/v1/operator/queues').set('Cookie', assignedCookie).set('role', 'OPERATOR')).status).toBe(403);
    await db.user.update({ where: { id: operatorId }, data: { isActive: false } });
    expect((await request(app).get('/api/v1/operator/queues').set('Cookie', assignedCookie)).status).toBe(401);
    const before = await db.queue.findUniqueOrThrow({ where: { id: queueId } });
    expect((await request(fixture).post(`/action/${entryId}`).set('Cookie', assignedCookie).send({ operatorId })).status).toBe(401);
    expect(await db.queue.findUniqueOrThrow({ where: { id: queueId } })).toEqual(before);
  } finally {
    await db.user.update({ where: { id: operatorId }, data: { role: user.role, isActive: user.isActive } });
    await db.operatorQueueAssignment.deleteMany({ where: { operatorId, queueId: temporaryQueue.id } });
    await db.queue.delete({ where: { id: temporaryQueue.id } });
  }
});

test('authorized workflow reaches real desk and lifecycle conflict handlers', async () => {
  const app = createApp({ db, webOrigin: 'http://127.0.0.1:5173' });
  expect((await request(app).get(`/api/v1/operator/queues/${queueId}/desk`).set('Cookie', assignedCookie)).status).toBe(200);
  for (const [path, code] of [[`queues/${queueId}/call-next`, 'QUEUE_EMPTY'], [`entries/${entryId}/start-service`, 'INVALID_TRANSITION'], [`entries/${entryId}/complete`, 'INVALID_TRANSITION']]) {
    const response = await request(app).post(`/api/v1/operator/${path}`).set('Cookie', assignedCookie).set('Origin', 'http://127.0.0.1:5173').send({});
    expect(response.status).toBe(409); expect(response.body.error.code).toBe(code);
  }
});

import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { seed } from '../../prisma/seed.js';

const db = new PrismaClient();
const origin = 'http://127.0.0.1:5173';
const app = createApp({ db, webOrigin: origin });
const sessions: string[] = [];
let queueId: string;
let customerId: string;
let entryId: string;
let operatorId: string;
async function login(email: string) {
  const response = await request(app).post('/api/v1/auth/login').set('Origin', origin).send({
    email, password: email.startsWith('customer') ? process.env.DEMO_CUSTOMER_PASSWORD : process.env.DEMO_OPERATOR_PASSWORD,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers['set-cookie'][0].split(';')[0];
  const tokenHash = createHash('sha256').update(cookie.split('=')[1]).digest('hex');
  const session = await db.session.findUniqueOrThrow({ where: { tokenHash } });
  sessions.push(session.id);
  return cookie;
}
async function state() {
  return {
    queues: await db.queue.findMany({ orderBy: { id: 'asc' } }),
    entries: await db.queueEntry.findMany({ orderBy: { id: 'asc' } }),
    events: await db.queueEvent.findMany({ orderBy: { id: 'asc' } }),
    assignments: await db.operatorQueueAssignment.findMany({ orderBy: { operatorId: 'asc' } }),
  };
}
function denied(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: { code, message: expect.any(String), requestId: expect.any(String) } });
  for (const privateValue of [queueId, entryId, customerId]) expect(JSON.stringify(response.body)).not.toContain(privateValue);
}
beforeAll(async () => {
  await seed(db);
  queueId = (await db.queue.findUniqueOrThrow({ where: { code: 'R' } })).id;
  customerId = (await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } })).id;
  operatorId = (await db.user.findUniqueOrThrow({ where: { email: 'operator.a@example.test' } })).id;
  const entry = await db.queueEntry.create({ data: { queueId, customerId, sequence: 700001n, displayNumber: `AUTH-${randomUUID().slice(0, 20)}`, partySize: 4 } });
  entryId = entry.id;
});
afterEach(async () => { await db.session.deleteMany({ where: { id: { in: sessions.splice(0) } } }); });
afterAll(async () => { if (entryId) await db.queueEntry.delete({ where: { id: entryId } }); await db.$disconnect(); });

test('TEST-010 assigned operator receives only assigned queue public metadata', async () => {
  const cookie = await login('operator.a@example.test');
  const before = await state();
  const response = await request(app).get('/api/v1/operator/queues').set('Cookie', cookie);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ data: [{ id: queueId, code: 'R', name: 'Restaurant Waiting Queue', state: 'OPEN' }] });
  expect(await state()).toEqual(before);
});

test('TEST-011 unassigned operator has empty list and cannot inspect or mutate R', async () => {
  const cookie = await login('operator.b@example.test');
  const before = await state();
  const list = await request(app).get('/api/v1/operator/queues').set('Cookie', cookie).set('operatorId', operatorId).query({ operatorId });
  expect(list.status).toBe(200);
  expect(list.body).toEqual({ data: [] });
  denied(await request(app).get(`/api/v1/operator/queues/${queueId}/desk`).set('Cookie', cookie), 403, 'QUEUE_ACCESS_DENIED');
  for (const path of [`queues/${queueId}/call-next`, `entries/${entryId}/start-service`, `entries/${entryId}/complete`]) {
    denied(await request(app).post(`/api/v1/operator/${path}`).set('Cookie', cookie).set('Origin', origin).send({ operatorId }), 403, 'QUEUE_ACCESS_DENIED');
  }
  expect(await state()).toEqual(before);
});

test('TEST-012 customers cannot list operator queues or call/start/complete', async () => {
  const cookie = await login('customer.a@example.test');
  const before = await state();
  denied(await request(app).get('/api/v1/operator/queues').set('Cookie', cookie), 403, 'FORBIDDEN');
  for (const path of [`queues/${queueId}/call-next`, `entries/${entryId}/start-service`, `entries/${entryId}/complete`]) {
    denied(await request(app).post(`/api/v1/operator/${path}`).set('Cookie', cookie).set('Origin', origin).send({}), 403, 'FORBIDDEN');
  }
  expect(await state()).toEqual(before);
});

test('TEST-013 forged role and identities cannot override the authenticated customer', async () => {
  const cookie = await login('customer.a@example.test');
  const before = await state();
  denied(await request(app).post(`/api/v1/operator/queues/${queueId}/call-next`).set('Cookie', cookie)
    .query({ role: 'OPERATOR', operatorId, customerId: operatorId }).set('Origin', origin).set('role', 'OPERATOR').set('X-Role', 'OPERATOR').set('operatorId', operatorId)
    .send({ role: 'OPERATOR', operatorId, customerId: operatorId }), 403, 'FORBIDDEN');
  expect(await state()).toEqual(before);
});

test('operator cannot use customer discovery, join or private entry routes', async () => {
  const cookie = await login('operator.a@example.test');
  const before = await state();
  for (const path of ['/api/v1/queues', `/api/v1/customer/entries/${entryId}`, '/api/v1/customer/entries/latest']) {
    denied(await request(app).get(path).set('Cookie', cookie), 403, 'FORBIDDEN');
  }
  denied(await request(app).post(`/api/v1/queues/${queueId}/entries`).set('Cookie', cookie).set('Origin', origin).send({ customerId, role: 'CUSTOMER', partySize: 4 }), 403, 'FORBIDDEN');
  expect(await state()).toEqual(before);
});

test('missing, expired, revoked and inactive sessions fail closed on operator routes', async () => {
  const before = await state();
  denied(await request(app).get('/api/v1/operator/queues'), 401, 'UNAUTHENTICATED');
  for (const data of [{ expiresAt: new Date(0) }, { revokedAt: new Date() }]) {
    const cookie = await login('operator.a@example.test');
    await db.session.update({ where: { id: sessions.at(-1)! }, data });
    denied(await request(app).get('/api/v1/operator/queues').set('Cookie', cookie), 401, 'UNAUTHENTICATED');
  }
  expect(await state()).toEqual(before);
});


test('private namespace authentication and role checks precede malformed bodies and content checks', async () => {
  const customer = await login('customer.a@example.test');
  const operator = await login('operator.a@example.test');
  const before = await state();
  for (const [path, cookie, status, code] of [
    [`/api/v1/operator/queues/${queueId}/call-next`, '', 401, 'UNAUTHENTICATED'],
    [`/api/v1/operator/queues/${queueId}/call-next`, customer, 403, 'FORBIDDEN'],
    [`/api/v1/queues/${queueId}/entries`, operator, 403, 'FORBIDDEN'],
  ] as const) {
    for (const type of ['application/json', 'text/plain']) {
      denied(await request(app).post(path).set('Cookie', cookie).set('Origin', origin)
        .set('Content-Type', type).send('{"role":"OPERATOR",'), status, code);
    }
  }
  expect(await state()).toEqual(before);
});

test('invalid queue and entry IDs produce safe denials and cannot change state', async () => {
  const operator = await login('operator.a@example.test');
  const customer = await login('customer.a@example.test');
  const before = await state();
  for (const id of ['not-a-uuid', '00000000-0000-0000-0000-000000000000', randomUUID()]) {
    denied(await request(app).get(`/api/v1/operator/queues/${id}/desk`).set('Cookie', operator), 403, 'QUEUE_ACCESS_DENIED');
    denied(await request(app).post(`/api/v1/operator/entries/${id}/complete`).set('Cookie', operator).set('Origin', origin).send({}), 404, 'ENTRY_NOT_FOUND');
    denied(await request(app).get(`/api/v1/customer/entries/${id}`).set('Cookie', customer), 404, 'ENTRY_NOT_FOUND');
  }
  expect(await state()).toEqual(before);
});

test('missing and invalidated sessions cannot reach private mutation guards', async () => {
  const before = await state();
  const paths = [`/api/v1/operator/queues/${queueId}/call-next`, `/api/v1/operator/entries/${entryId}/start-service`, `/api/v1/operator/entries/${entryId}/complete`, `/api/v1/queues/${queueId}/entries`];
  for (const data of [null, { expiresAt: new Date(0) }, { revokedAt: new Date() }]) {
    const cookie = data ? await login('operator.a@example.test') : '';
    if (data) await db.session.update({ where: { id: sessions.at(-1)! }, data });
    for (const path of paths) {
      denied(await request(app).post(path).set('Cookie', cookie).set('Origin', origin).send({ role: 'OPERATOR', operatorId }), 401, 'UNAUTHENTICATED');
    }
  }
  expect(await state()).toEqual(before);
});

test('protected auth routes reject invalid sessions before malformed JSON without revoking a valid session', async () => {
  for (const data of [null, { expiresAt: new Date(0) }, { revokedAt: new Date() }]) {
    const cookie = data ? await login('operator.a@example.test') : '';
    if (data) await db.session.update({ where: { id: sessions.at(-1)! }, data });
    for (const [method, path] of [['get', '/api/v1/auth/me'], ['post', '/api/v1/auth/logout']] as const) {
      denied(await request(app)[method](path).set('Cookie', cookie).set('Origin', origin)
        .set('Content-Type', 'application/json').send('{"role":'), 401, 'UNAUTHENTICATED');
    }
  }
  const cookie = await login('operator.a@example.test');
  const sessionId = sessions.at(-1)!;
  const before = await db.session.findUniqueOrThrow({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } });
  denied(await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', origin)
    .set('Content-Type', 'application/json').send('{"role":'), 400, 'MALFORMED_JSON');
  expect(await db.session.findUniqueOrThrow({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } })).toEqual(before);
});

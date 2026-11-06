import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { verify } from 'argon2';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { seed } from '../../prisma/seed.js';

const db = new PrismaClient();
const origin = 'http://127.0.0.1:5173';
const customerEmail = 'customer.a@example.test';
const password = process.env.DEMO_CUSTOMER_PASSWORD!;
const sessionIds: string[] = [];
let now = new Date('2026-11-06T08:00:00.000Z');
const app = () => createApp({ now: () => now, webOrigin: origin });
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const login = (api = app(), email = customerEmail, value = password) => request(api).post('/api/v1/auth/login').set('Origin', origin).send({ email, password: value });
function cookie(response: request.Response) {
  const header = response.headers['set-cookie']?.[0] ?? '';
  return header.split(';')[0];
}
async function trackedLogin(api = app(), email = customerEmail, value = password) {
  const response = await login(api, email, value);
  const token = cookie(response).split('=')[1];
  if (token) {
    const row = await db.session.findUnique({ where: { tokenHash: digest(token) } });
    if (row) sessionIds.push(row.id);
  }
  return response;
}
function safeIdentity(body: unknown, id: string, displayName: string, role: string) {
  expect(body).toEqual({ data: { user: { id, displayName, role } } });
}
beforeAll(async () => { await seed(db, process.env); });
afterEach(async () => {
  vi.restoreAllMocks();
  await db.session.deleteMany({ where: { id: { in: sessionIds.splice(0) } } });
  now = new Date('2026-11-06T08:00:00.000Z');
});
afterAll(() => db.$disconnect());

test('TEST-001 valid customer and operator login use server identity', async () => {
  for (const [email, secret, role] of [[customerEmail, password, 'CUSTOMER'], ['operator.a@example.test', process.env.DEMO_OPERATOR_PASSWORD!, 'OPERATOR']]) {
    const response = await trackedLogin(app(), email.toUpperCase(), secret);
    expect(response.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(response.body).toEqual({ data: { user: { id: user.id, displayName: user.displayName, role }, expiresAt: '2026-11-06T16:00:00.000Z' } });
    expect(cookie(response).startsWith('qs_session=')).toBe(true);
  }
});

test('TEST-002 wrong password and unknown/inactive account share generic errors and create no sessions', async () => {
  const before = await db.session.count();
  const wrong = await login(app(), customerEmail, 'incorrect synthetic password');
  const unknown = await login(app(), 'missing@example.test');
  for (const response of [wrong, unknown]) {
    expect(response.status).toBe(401);
    expect(response.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.', requestId: expect.any(String) });
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect(await db.session.count()).toBe(before);
  const user = await db.user.findUniqueOrThrow({ where: { email: customerEmail } });
  expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
  expect(await verify(user.passwordHash, password)).toBe(true);
  await db.user.update({ where: { id: user.id }, data: { isActive: false } });
  try { expect((await login()).body.error.code).toBe('INVALID_CREDENTIALS'); }
  finally { await db.user.update({ where: { id: user.id }, data: { isActive: true } }); }
});

test('TEST-003 me returns only current identity and reads account activity from DB', async () => {
  const response = await trackedLogin();
  const user = await db.user.findUniqueOrThrow({ where: { email: customerEmail } });
  const me = await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(response));
  expect(me.status).toBe(200);
  safeIdentity(me.body, user.id, user.displayName, user.role);
  expect(me.headers['cache-control']).toContain('no-store');
  await db.user.update({ where: { id: user.id }, data: { isActive: false } });
  try { expect((await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(401); }
  finally { await db.user.update({ where: { id: user.id }, data: { isActive: true } }); }
});

test('TEST-004 logout revokes only this session before 204 and prevents replay', async () => {
  const first = await trackedLogin();
  const second = await trackedLogin();
  const response = await request(app()).post('/api/v1/auth/logout').set('Cookie', cookie(first)).set('Origin', origin).send({});
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(response.headers['set-cookie'][0]).toContain('qs_session=;');
  const row = await db.session.findUniqueOrThrow({ where: { tokenHash: digest(cookie(first).split('=')[1]) } });
  expect(row.revokedAt?.toISOString()).toBe(now.toISOString());
  expect((await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(first))).status).toBe(401);
  expect((await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(second))).status).toBe(200);
});

test('TEST-005 missing, malformed and unknown sessions cannot access protected requests', async () => {
  for (const value of ['', 'qs_session=invalid', `qs_session=${'a'.repeat(43)}`, 'qs_session=%ZZ']) {
    for (const [method, path] of [['get', '/api/v1/auth/me'], ['post', '/api/v1/auth/logout'], ['post', '/api/v1/queues/11111111-1111-4111-8111-111111111111/entries']] as const) {
      const response = await request(app())[method](path).set('Cookie', value).set('Origin', origin).send({});
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect(response.body.error.requestId).toEqual(expect.any(String));
    }
  }
});

test('TEST-006 eight-hour absolute expiry rejects exactly at boundary without renewal', async () => {
  const response = await trackedLogin();
  const tokenHash = digest(cookie(response).split('=')[1]);
  const before = await db.session.findUniqueOrThrow({ where: { tokenHash } });
  now = new Date('2026-11-06T15:59:59.999Z');
  const me = await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(response));
  expect(me.status).toBe(200);
  expect(me.headers['set-cookie']).toBeUndefined();
  now = new Date('2026-11-06T16:00:00.000Z');
  expect((await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(401);
  now = new Date('2026-11-06T16:00:00.001Z');
  expect((await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(401);
  expect((await db.session.findUniqueOrThrow({ where: { tokenHash } })).expiresAt).toEqual(before.expiresAt);
});

test('TEST-007 invalid fields return 422 and malformed JSON returns safe 400 without persistence', async () => {
  const before = await db.session.count();
  const valid = { email: customerEmail, password };
  for (const input of [{}, null, [], { ...valid, email: '' }, { ...valid, password: '' }, { ...valid, email: 42 }, { ...valid, password: {} }, { ...valid, email: 'bad' }, { ...valid, email: 'a'.repeat(255) }, { ...valid, password: 'a'.repeat(257) }, { ...valid, role: 'OPERATOR' }, { ...valid, userId: 'forged' }]) {
    const response = await request(app()).post('/api/v1/auth/login').set('Origin', origin).set('Content-Type', 'application/json').send(JSON.stringify(input));
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields).toEqual(expect.any(Object));
    expect(JSON.stringify(response.body).includes(password)).toBe(false);
  }
  const malformed = await request(app()).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"password":');
  expect(malformed.status).toBe(400);
  expect(malformed.body.error.code).toBe('MALFORMED_JSON');
  expect(await db.session.count()).toBe(before);
});

test('TEST-008 opaque unique tokens, SHA-256 storage, secure cookies, and no JSON/log secrets', async () => {
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
  const response = await trackedLogin();
  const another = await trackedLogin();
  const header = response.headers['set-cookie'][0];
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=28800']) expect(header.includes(flag)).toBe(true);
  const token = cookie(response).split('=')[1];
  expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(32);
  expect(cookie(another) === cookie(response)).toBe(false);
  const row = await db.session.findUniqueOrThrow({ where: { tokenHash: digest(token) } });
  expect(row.tokenHash.length).toBe(64);
  expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(8 * 60 * 60 * 1000);
  const user = await db.user.findUniqueOrThrow({ where: { id: row.userId } });
  const serialized = JSON.stringify(response.body) + JSON.stringify(spies.flatMap(spy => spy.mock.calls));
  for (const secret of [token, row.tokenHash, password, user.passwordHash]) expect(serialized.includes(secret)).toBe(false);
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('COOKIE_SECURE', 'false');
  try {
    const secure = await trackedLogin();
    expect(secure.headers['set-cookie'][0].includes('Secure')).toBe(true);
    const logout = await request(app()).post('/api/v1/auth/logout').set('Origin', origin).set('Cookie', cookie(secure)).send({});
    for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Secure']) expect(logout.headers['set-cookie'][0].includes(flag)).toBe(true);
  } finally { vi.unstubAllEnvs(); }
});

test('TEST-050 origin and JSON protection reject unsafe requests without revoking session', async () => {
  const response = await trackedLogin();
  for (const badOrigin of ['https://evil.example', 'null', '']) {
    const logout = await request(app()).post('/api/v1/auth/logout').set('Cookie', cookie(response)).set('Origin', badOrigin).send({});
    expect(logout.status).toBe(403);
    expect(logout.body.error.code).toBe('FORBIDDEN');
  }
  const form = await request(app()).post('/api/v1/auth/logout').set('Cookie', cookie(response)).set('Origin', origin).type('form').send({});
  expect(form.status).toBe(415);
  expect((await request(app()).get('/api/v1/auth/me').set('Cookie', cookie(response))).status).toBe(200);
  expect((await login(app()).set('Origin', 'https://evil.example')) .status).toBe(403);
});

test('TEST-051 repository failures return safe 500 JSON without credential logging or cookies', async () => {
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
  const privateDiagnostic = 'private SQL diagnostics must never escape';
  const failedDb = { user: { findUnique: async () => { throw new Error(privateDiagnostic); } } } as unknown as PrismaClient;
  const response = await login(createApp({ db: failedDb, webOrigin: origin }));
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId: expect.any(String) } });
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(JSON.stringify(spies.flatMap(spy => spy.mock.calls)).includes(privateDiagnostic)).toBe(false);
  const failedSessions = { user: db.user, session: { create: async () => { throw new Error(privateDiagnostic); } } } as unknown as PrismaClient;
  const persistence = await login(createApp({ db: failedSessions, webOrigin: origin }));
  expect(persistence.status).toBe(500);
  expect(persistence.headers['set-cookie']).toBeUndefined();
});

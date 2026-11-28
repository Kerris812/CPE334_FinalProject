import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../../src/app.js';
import { db, fixture, origin } from './queue-fixture.js';

export { db, setup } from './queue-fixture.js';
export const app = createApp({ db, webOrigin: origin });
export type Actor = { id: string; cookie: string };
export const get = (path: string, who?: Actor) => {
  const query = request(app).get(`/api/v1${path}`);
  return who ? query.set('Cookie', who.cookie) : query;
};
export const post = (path: string, who?: Actor, body: unknown = {}) => {
  const query = request(app).post(`/api/v1${path}`).set('Origin', origin).set('Content-Type', 'application/json').send(JSON.stringify(body));
  return who ? query.set('Cookie', who.cookie) : query;
};
export const call = (queueId: string, who: Actor) => post(`/operator/queues/${queueId}/call-next`, who);
export const action = (entryId: string, name: 'start-service' | 'complete', who?: Actor, body: unknown = {}) => post(`/operator/entries/${entryId}/${name}`, who, body);
export async function snapshot() {
  return {
    users: await db.user.findMany({ orderBy: { id: 'asc' } }),
    sessions: await db.session.findMany({ orderBy: { id: 'asc' } }),
    assignments: await db.operatorQueueAssignment.findMany({ orderBy: [{ operatorId: 'asc' }, { queueId: 'asc' }] }),
    queues: await db.queue.findMany({ orderBy: { id: 'asc' } }),
    entries: await db.queueEntry.findMany({ orderBy: { id: 'asc' } }),
    events: await db.queueEvent.findMany({ orderBy: { id: 'asc' } }),
  };
}
export async function rejected(run: () => PromiseLike<request.Response>, code: string, status = 409) {
  const before = await snapshot();
  const response = await run();
  expect(response.status).toBe(status);
  expect(response.body.error).toEqual({ code, message: expect.any(String), requestId: expect.any(String), ...(response.body.error.details ? { details: response.body.error.details } : {}) });
  expect(await snapshot()).toEqual(before);
  return response;
}
export async function lab7Fixture() {
  const f = await fixture();
  const r = f.queue;
  const s = await f.useS();
  const sessionIds: string[] = [];
  async function seeded(letter: 'a' | 'b') {
    const user = await db.user.findUniqueOrThrow({ where: { email: `operator.${letter}@example.test` } });
    const token = randomBytes(32).toString('base64url');
    const session = await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    sessionIds.push(session.id);
    return { id: user.id, cookie: `qs_session=${token}` };
  }
  async function assigned() {
    const who = await f.actor('OPERATOR');
    await db.operatorQueueAssignment.createMany({ data: [r, s].map(q => ({ operatorId: who.id, queueId: q.id })) });
    return who;
  }
  async function join(queue = r, size = queue.code === 'R' ? 4 : 5, who?: Actor) {
    const customer = who ?? await f.actor();
    const response = await post(`/queues/${queue.id}/entries`, customer, { partySize: size });
    expect(response.status).toBe(201);
    return { customer, entry: response.body.data as { id: string; displayNumber: string; status: string; sequence: number; queueId: string; partySize: number } };
  }
  async function clean() {
    await f.clean();
    await db.session.deleteMany({ where: { id: { in: sessionIds } } });
  }
  return { ...f, r, s, seeded, assigned, join, clean };
}
export type Lab7Fixture = Awaited<ReturnType<typeof lab7Fixture>>;

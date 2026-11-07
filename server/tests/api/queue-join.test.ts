import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { seed } from '../../prisma/seed.js';
import { db, setup, fixture, origin, type Fixture } from '../support/queue-fixture.js';
const app = createApp({ db, webOrigin: origin });
let f: Fixture;
beforeAll(setup); beforeEach(async () => { f = await fixture(); }); afterEach(() => f.clean()); afterAll(() => db.$disconnect());
const join = (who = f.customer, body: unknown = { partySize: 4 }, queueId = f.queue.id) => request(app).post(`/api/v1/queues/${queueId}/entries`).set('Cookie', who.cookie).set('Origin', origin).set('Content-Type', 'application/json').send(JSON.stringify(body));
function error(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.body.error).toMatchObject({ code, message: expect.any(String), requestId: expect.any(String) }); expect(Object.keys(response.body)).toEqual(['error']);
}
test('TEST-016 customer discovers R and joins with one WAITING entry and JOINED event', async () => {
  await f.useR();
  const list = await request(app).get('/api/v1/queues').set('Cookie', f.customer.cookie);
  expect(list.status).toBe(200); expect(list.body.data).toContainEqual({ id: f.queue.id, code: 'R', name: f.queue.name, state: 'OPEN' });
  for (const row of list.body.data) expect(Object.keys(row).sort()).toEqual(['code', 'id', 'name', 'state']);
  const response = await join(); expect(response.status).toBe(201);
  const sequence = Number(f.queue.lastSequence + 1n);
  expect(response.body).toEqual({ data: { id: expect.any(String), queueId: f.queue.id, displayNumber: `R-${String(sequence).padStart(4, '0')}`, sequence, partySize: 4, status: 'WAITING', joinedAt: expect.any(String) } });
  const entry = await db.queueEntry.findUniqueOrThrow({ where: { id: response.body.data.id } }); expect(entry.customerId).toBe(f.customer.id);
  expect(await db.queueEvent.findMany({ where: { entryId: entry.id } })).toEqual([expect.objectContaining({ actorId: f.customer.id, eventType: 'JOINED', fromStatus: null, toStatus: 'WAITING', occurredAt: expect.any(Date) })]);
  expect((await db.queue.findUniqueOrThrow({ where: { id: f.queue.id } })).lastSequence).toBe(BigInt(sequence));
});
test('TEST-017 boundaries 1/4 on R and 5/8 on S are accepted', async () => {
  const s = await f.useS();
  for (const partySize of [1, 4, 5, 8]) { const response = await join(await f.actor(), { partySize }, partySize <= 4 ? f.queue.id : s.id); expect(response.status).toBe(201); expect(response.body.data.partySize).toBe(partySize); }
});
test('TEST-018 invalid sizes create no entries, events or counter increments', async () => {
  const before = await f.state();
  for (const body of [{ partySize: 0 }, { partySize: 9 }, { partySize: -1 }, { partySize: 1.5 }, { partySize: '3' }, { partySize: null }, {}, null, []]) {
    const response = await join(f.customer, body); error(response, 422, 'VALIDATION_ERROR'); expect(response.body.error.details.fields.partySize).toBe('Must be an integer from 1 to 8.'); expect(await f.state()).toEqual(before);
  }
});
test('TEST-019 active entries block same and other queues; COMPLETED permits joining', async () => {
  for (const status of ['WAITING', 'CALLED', 'SERVING'] as const) {
    const other = await f.useS(); const entry = await f.entry(status, f.customer, other); const before = await f.state();
    error(await join(), 409, 'DUPLICATE_ACTIVE_ENTRY'); error(await join(f.customer, { partySize: 5 }, other.id), 409, 'DUPLICATE_ACTIVE_ENTRY'); expect(await f.state()).toEqual(before);
    await db.queueEntry.delete({ where: { id: entry.id } });
  }
  await f.entry('COMPLETED', f.customer, await f.newQueue()); expect((await join()).status).toBe(201);
});
test('TEST-020 twenty concurrent same-customer requests create exactly one entry and event', async () => {
  const responses = await Promise.all(Array.from({ length: 20 }, () => join()));
  expect(responses.filter(row => row.status === 201)).toHaveLength(1); expect(responses.filter(row => row.status === 409 && row.body.error.code === 'DUPLICATE_ACTIVE_ENTRY')).toHaveLength(19);
  const state = await f.state(); expect(state.entries).toHaveLength(1); expect(state.events).toHaveLength(1); expect(state.queues[0].lastSequence).toBe(1n);
});
test('TEST-021 twenty different customers get distinct gap-free queue numbers', async () => {
  const actors = await Promise.all(Array.from({ length: 20 }, () => f.actor())); const responses = await Promise.all(actors.map(who => join(who)));
  expect(responses.map(row => row.status)).toEqual(Array(20).fill(201)); expect(responses.map(row => row.body.data.sequence).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1)); expect(new Set(responses.map(row => row.body.data.displayNumber)).size).toBe(20);
  const state = await f.state(); expect(state.entries).toHaveLength(20); expect(state.events).toHaveLength(20); expect(state.queues[0].lastSequence).toBe(20n);
});
test('TEST-022 PAUSED and CLOSED fixtures reject joining and disappear from discovery', async () => {
  for (const state of ['PAUSED', 'CLOSED'] as const) {
    await db.queue.update({ where: { id: f.queue.id }, data: { state } }); const before = await f.state(); error(await join(), 409, 'QUEUE_NOT_OPEN'); expect(await f.state()).toEqual(before);
    const list = await request(app).get('/api/v1/queues').set('Cookie', f.customer.cookie); expect(list.body.data.some((row: { id: string }) => row.id === f.queue.id)).toBe(false);
  }
});
test('TEST-023 body identity is rejected and forged headers cannot impersonate another customer', async () => {
  const other = await f.actor(); const before = await f.state();
  for (const extra of [{ customerId: other.id }, { userId: other.id }, { role: 'OPERATOR' }, { joinedAt: new Date().toISOString() }]) { error(await join(f.customer, { partySize: 4, ...extra }), 422, 'VALIDATION_ERROR'); expect(await f.state()).toEqual(before); }
  const response = await join().set('customerId', other.id).set('X-Role', 'OPERATOR').query({ customerId: other.id }); expect(response.status).toBe(201); expect((await db.queueEntry.findUniqueOrThrow({ where: { id: response.body.data.id } })).customerId).toBe(f.customer.id);
});
async function start() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { env: { ...process.env, PORT: '3302', WEB_ORIGIN: origin }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw new Error('API restart process exited'); try { if ((await fetch('http://127.0.0.1:3302/health')).ok) return child; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
  child.kill(); throw new Error('API restart readiness timeout');
}
async function stop(child: ChildProcess) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
test('TEST-024 entry/event and numbers beyond 9999 survive actual process restart and reseed', async () => {
  await db.queue.update({ where: { id: f.queue.id }, data: { lastSequence: 9999n } });
  async function processJoin(who = f.customer) { const response = await fetch(`http://127.0.0.1:3302/api/v1/queues/${f.queue.id}/entries`, { method: 'POST', headers: { Cookie: who.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ partySize: 4 }) }); expect(response.status).toBe(201); return (await response.json()).data; }
  let saved; const first = await start(); try { saved = await processJoin(); expect(saved.displayNumber).toBe(`${f.queue.code}-10000`); } finally { await stop(first); }
  const entry = await db.queueEntry.findUniqueOrThrow({ where: { id: saved.id } }); const events = await db.queueEvent.findMany({ where: { entryId: saved.id } }); await seed(db);
  const second = await start(); try {
    const read = await fetch(`http://127.0.0.1:3302/api/v1/customer/entries/${saved.id}`, { headers: { Cookie: f.customer.cookie } }); expect(read.status).toBe(200); expect((await read.json()).data.displayNumber).toBe(saved.displayNumber);
    expect(await db.queueEntry.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(entry); expect(await db.queueEvent.findMany({ where: { entryId: saved.id } })).toEqual(events);
    const next = await processJoin(await f.actor()); expect(next.sequence).toBe(10001);
  } finally { await stop(second); }
}, 15000);
test('join authentication, role, origin and unknown queue denials preserve data', async () => {
  const before = await f.state(); error(await join({ id: '', cookie: '' }), 401, 'UNAUTHENTICATED'); error(await join(await f.actor('OPERATOR')), 403, 'FORBIDDEN'); error(await join().set('Origin', 'https://foreign.example'), 403, 'FORBIDDEN');
  for (const id of [randomUUID(), 'invalid']) error(await join(f.customer, { partySize: 4 }, id), 404, 'QUEUE_NOT_FOUND'); expect(await f.state()).toEqual(before);
});
test('cross-queue simultaneous same-customer joining commits only one increment', async () => {
  const other = await f.useS(); const responses = await Promise.all([join(), join(f.customer, { partySize: 5 }, other.id)]); expect(responses.map(row => row.status).sort()).toEqual([201, 409]);
  const state = await f.state(); expect(state.entries).toHaveLength(1); expect(state.events).toHaveLength(1); expect(state.queues.reduce((sum, row) => sum + row.lastSequence, 0n)).toBe(1n);
});
test('number collision returns NUMBER_CONFLICT and rolls back all writes', async () => {
  await f.entry('COMPLETED'); const before = await f.state(); error(await join(), 409, 'NUMBER_CONFLICT'); expect(await f.state()).toEqual(before);
});
test('real PostgreSQL audit insert failure rolls back entry and counter', async () => {
  const before = await f.state();
  // Generated fixture UUID only. The failure trigger rejects only this actor.
  await db.$executeRawUnsafe(`CREATE FUNCTION queue_test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id = '${f.customer.id}'::uuid THEN RAISE EXCEPTION 'Fixture audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER queue_test_reject_event BEFORE INSERT ON queue_events FOR EACH ROW EXECUTE FUNCTION queue_test_reject_event()');
  try { error(await join(), 500, 'INTERNAL_ERROR'); expect(await f.state()).toEqual(before); }
  finally { await db.$executeRawUnsafe('DROP TRIGGER queue_test_reject_event ON queue_events'); await db.$executeRawUnsafe('DROP FUNCTION queue_test_reject_event()'); }
});
test('transaction revalidates persisted customer role and activity before any queue write', async () => {
  const { joinQueue } = await import('../../src/queues/service.js');
  const operator = await f.actor('OPERATOR'); const before = await f.state();
  await expect(joinQueue(db, operator.id, f.queue.id, { partySize: 4 })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' }); expect(await f.state()).toEqual(before);
  await db.user.update({ where: { id: f.customer.id }, data: { isActive: false } });
  await expect(joinQueue(db, f.customer.id, f.queue.id, { partySize: 4 })).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' }); expect(await f.state()).toEqual(before);
});

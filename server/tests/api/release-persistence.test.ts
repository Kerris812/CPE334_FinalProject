import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { afterAll, expect, test } from 'vitest';
import { db, setup, fixture, origin } from '../support/queue-fixture.js';
import { seed } from '../../prisma/seed.js';
const base = 'http://127.0.0.1:3310';
async function start() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { env: { ...process.env, PORT: '3310', WEB_ORIGIN: origin }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Persistence API exited before readiness');
    try { if ((await fetch(`${base}/health`)).ok) return child; } catch { /* wait for listener */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill(); throw new Error('Persistence API readiness timeout');
}
async function stop(child: ChildProcess) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
afterAll(() => db.$disconnect());
test('TEST-015 completed entry and four audit events survive actual API restart and idempotent seed', async () => {
  await setup(); const f = await fixture(); const operator = await f.actor('OPERATOR');
  await db.operatorQueueAssignment.create({ data: { operatorId: operator.id, queueId: f.queue.id } });
  const request = (path: string, cookie: string, body?: unknown) => fetch(`${base}/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let first: ChildProcess | undefined; let second: ChildProcess | undefined;
  try {
    first = await start();
    const joined = await request(`/queues/${f.queue.id}/entries`, f.customer.cookie, { partySize: 4 }); expect(joined.status).toBe(201); const entryId = (await joined.json()).data.id;
    for (const path of [`/operator/queues/${f.queue.id}/call-next`, `/operator/entries/${entryId}/start-service`, `/operator/entries/${entryId}/complete`]) expect((await request(path, operator.cookie, {})).status).toBe(200);
    const beforeResponse = await request(`/customer/entries/${entryId}`, f.customer.cookie); expect(beforeResponse.status).toBe(200); const before = await beforeResponse.json(); expect(before.data.status).toBe('COMPLETED');
    const entry = await db.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    const events = await db.queueEvent.findMany({ where: { entryId }, orderBy: { occurredAt: 'asc' } }); expect(events.map(row => row.eventType)).toEqual(['JOINED', 'CALLED', 'STARTED', 'COMPLETED']);
    const queue = await db.queue.findUniqueOrThrow({ where: { id: f.queue.id } });
    await stop(first); first = undefined; await seed(db); await seed(db);
    second = await start();
    const after = await request(`/customer/entries/${entryId}`, f.customer.cookie); expect(after.status).toBe(200); expect(await after.json()).toEqual(before);
    expect(await db.queueEntry.findUniqueOrThrow({ where: { id: entryId } })).toEqual(entry);
    expect(await db.queueEvent.findMany({ where: { entryId }, orderBy: { occurredAt: 'asc' } })).toEqual(events);
    expect(await db.queue.findUniqueOrThrow({ where: { id: f.queue.id } })).toEqual(queue);
  } finally { if (first) await stop(first); if (second) await stop(second); await f.clean(); }
}, 20000);

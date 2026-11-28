import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { type Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { action, call, db, get, lab7Fixture, post, rejected, setup, type Lab7Fixture } from '../support/lab7-fixture.js';

let f: Lab7Fixture;
beforeAll(setup);
beforeEach(async () => { f = await lab7Fixture(); });
afterEach(async () => { await f.clean(); });
afterAll(() => db.$disconnect());
async function hold(lock: (tx: Prisma.TransactionClient) => Promise<unknown>, run: (release: () => void, pid: number) => Promise<void>) {
  let release!: () => void; let ready!: (pid: number) => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<number>(resolve => { ready = resolve; });
  const holding = db.$transaction(async tx => {
    await lock(tx);
    const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    ready(row.pid); await gate;
  }, { timeout: 15000 });
  try { await run(release, await locked); } finally { release(); await holding; }
}
async function blockedBy(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE ${pid}::int=ANY(pg_blocking_pids(pid))`;
    if (row.count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected writer did not reach the PostgreSQL lock barrier');
}

test('S2-TEST-20: holding Counter R blocks its writer while Counter S remains independently callable', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  const r = await f.join(); const s = await f.join(f.s);
  const cr = await db.serviceCounter.findUniqueOrThrow({ where: { code: 'R' } });
  await hold(tx => tx.$queryRaw`SELECT id FROM service_counters WHERE id=${cr.id}::uuid FOR UPDATE`, async (release, pid) => {
    const pending = Promise.resolve(call(f.r.id, a));
    try {
      await blockedBy(pid);
      const response = await call(f.s.id, b).timeout({ deadline: 3000 });
      expect(response.status).toBe(200); expect(response.body.data.id).toBe(s.entry.id);
      expect((await db.queueEntry.findUniqueOrThrow({ where: { id: r.entry.id } })).status).toBe('WAITING');
    } finally { release(); await pending; }
    expect((await db.queueEntry.findUniqueOrThrow({ where: { id: r.entry.id } })).status).toBe('CALLED');
  });
});

test('S2-TEST-09/19: revocation after route authorization but before queue lock denies the queued call', async () => {
  const operator = await f.assigned(); await f.join();
  await hold(tx => tx.$queryRaw`SELECT id FROM queues WHERE id=${f.r.id}::uuid FOR UPDATE`, async (release, pid) => {
    const pending = Promise.resolve(call(f.r.id, operator));
    try {
      await blockedBy(pid);
      await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId: operator.id, queueId: f.r.id } } });
    } finally { release(); }
    const response = await pending;
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('QUEUE_ACCESS_DENIED');
  });
  expect(await db.queueEvent.count({ where: { actorId: operator.id } })).toBe(0);
  expect((await get(`/operator/queues/${f.s.id}/desk`, operator)).status).toBe(200);
});

test('S2-TEST-09/19: revoked operator cannot start, complete, cancel or mark no-show using its existing session', async () => {
  const operator = await f.assigned(); const entry = await f.entry();
  await db.operatorQueueAssignment.delete({ where: { operatorId_queueId: { operatorId: operator.id, queueId: f.r.id } } });
  for (const [status, name, body] of [
    ['CALLED', 'start-service', {}], ['SERVING', 'complete', {}], ['CALLED', 'no-show', {}], ['WAITING', 'cancel', { reason: 'Synthetic cancellation' }],
  ] as const) {
    await db.queueEntry.update({ where: { id: entry.id }, data: { status, counterId: status === 'WAITING' ? null : f.counterId, calledAt: new Date(Date.now() - 301_000) } });
    await rejected(() => post(`/operator/entries/${entry.id}/${name}`, operator, body), 'QUEUE_ACCESS_DENIED', 403);
  }
});

test('S2-TEST-13/15: calls with and without a preview cannot double-book the queue or skip its FIFO head', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  const rows = [];
  for (const sequence of [9n, 3n]) rows.push(await f.entry('WAITING', await f.actor(), f.r, sequence));
  const cr = await db.serviceCounter.findUniqueOrThrow({ where: { code: 'R' } });
  const responses = await Promise.all([call(f.r.id, a), post(`/operator/queues/${f.r.id}/call-next`, b, { counterId: cr.id, expectedEntryId: rows[1].id })]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect(responses.find(r => r.status === 200)!.body.data.id).toBe(rows[1].id);
  expect(await db.queueEvent.count({ where: { eventType: 'CALLED', entryId: { in: rows.map(row => row.id) } } })).toBe(1);
});

test('S2-TEST-12/17: concurrent starts and completions commit once and retain the counter and winning actor', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b'); const { entry } = await f.join();
  const called = await call(f.r.id, a);
  for (const [name, eventType] of [['start-service', 'STARTED'], ['complete', 'COMPLETED']] as const) {
    const responses = await Promise.all([a, b].map(actor => action(entry.id, name, actor)));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = responses[0].status === 200 ? a : b;
    expect(await db.queueEvent.findMany({ where: { entryId: entry.id, eventType } })).toEqual([expect.objectContaining({ actorId: winner.id })]);
  }
  expect((await db.queueEntry.findUniqueOrThrow({ where: { id: entry.id } })).counterId).toBe(called.body.data.counterId);
});

async function start() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { env: { ...process.env, PORT: '3319' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Counter restart API exited before readiness');
    try { if ((await fetch('http://127.0.0.1:3319/health')).ok) return child; } catch { /* readiness probe */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill(); throw new Error('Counter restart API readiness timeout');
}
async function stop(child: ChildProcess) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
test('S2-TEST-17: both persisted reservations survive a real API restart and still reject occupied calls', async () => {
  const a = await f.seeded('a'); await f.join(); await f.join(f.s);
  await call(f.r.id, a); await call(f.s.id, a);
  let child: ChildProcess | undefined;
  try {
    const snapshots = [];
    for (let run = 0; run < 2; run++) {
      child = await start();
      const desks = [];
      for (const queue of [f.r, f.s]) {
        const response = await fetch(`http://127.0.0.1:3319/api/v1/operator/queues/${queue.id}/desk`, { headers: { Cookie: a.cookie } });
        expect(response.status).toBe(200);
        const desk = (await response.json()).data;
        expect(desk.counter.status).toBe('OCCUPIED'); desks.push(desk.counter);
      }
      snapshots.push(desks); await stop(child); child = undefined;
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
    await rejected(() => call(f.r.id, a), 'SERVICE_SLOT_BUSY');
  } finally { if (child) await stop(child); }
}, 20000);

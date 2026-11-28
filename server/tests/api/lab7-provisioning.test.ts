import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { action, call, db, get, lab7Fixture, setup, snapshot, type Actor, type Lab7Fixture } from '../support/lab7-fixture.js';

let f: Lab7Fixture;
let a: Actor;
let b: Actor;
beforeAll(setup);
beforeEach(async () => { f = await lab7Fixture(); a = await f.seeded('a'); b = await f.seeded('b'); });
afterEach(async () => { await f.clean(); });
afterAll(() => db.$disconnect());

for (const letter of ['A', 'B'] as const) {
  test(`L7-017 seeded Operator ${letter} lists both R and S after valid setup`, async () => {
    const response = await get('/operator/queues', letter === 'A' ? a : b);
    expect(response.status).toBe(200);
    expect(response.body.data.map((q: { code: string }) => q.code)).toEqual(['R', 'S']);
  });
}
test('L7-017 setup twice provisions exactly four distinct approved pairs without resetting history', async () => {
  const { entry } = await f.join(f.r);
  expect((await call(f.r.id, a)).status).toBe(200);
  expect((await action(entry.id, 'start-service', a)).status).toBe(200);
  expect((await action(entry.id, 'complete', a)).status).toBe(200);
  await db.queue.update({ where: { id: f.s.id }, data: { state: 'PAUSED', lastSequence: 99n } });
  const before = await snapshot();
  await seed(db);
  const once = await snapshot();
  await seed(db);
  expect(await snapshot()).toEqual(once);
  for (const key of ['users', 'sessions', 'queues', 'entries', 'events'] as const) expect(once[key]).toEqual(before[key]);
  for (const assignment of before.assignments) expect(once.assignments).toContainEqual(assignment);
  const pairs = await db.operatorQueueAssignment.findMany({ where: { operatorId: { in: [a.id, b.id] } }, include: { queue: true }, orderBy: [{ operatorId: 'asc' }, { queueId: 'asc' }] });
  expect(pairs.map(p => `${p.operatorId === a.id ? 'A' : 'B'}/${p.queue.code}`).sort()).toEqual(['A/R', 'A/S', 'B/R', 'B/S']);
});
test('L7-001 Operator A calls the FIFO head in Queue S using seeded assignments', async () => {
  const head = await f.join(f.s, 5);
  await f.join(f.s, 8);
  const response = await call(f.s.id, a);
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: head.entry.id, status: 'CALLED' });
  expect(await db.queueEvent.count({ where: { entryId: head.entry.id, eventType: 'CALLED', actorId: a.id } })).toBe(1);
});
test('L7-002 Operator B calls the FIFO head in Queue R using seeded assignments', async () => {
  const head = await f.join(f.r, 1);
  await f.join(f.r, 4);
  const response = await call(f.r.id, b);
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: head.entry.id, status: 'CALLED' });
  expect(await db.queueEvent.count({ where: { entryId: head.entry.id, eventType: 'CALLED', actorId: b.id } })).toBe(1);
});
test('L7-003 Operator A starts a Queue S customer called by B', async () => {
  const { entry } = await f.join(f.s);
  expect((await call(f.s.id, b)).status).toBe(200);
  const response = await action(entry.id, 'start-service', a);
  expect(response.status).toBe(200);
  expect(response.body.data.status).toBe('SERVING');
  expect(await db.queueEvent.findFirst({ where: { entryId: entry.id, eventType: 'STARTED' } })).toMatchObject({ actorId: a.id, fromStatus: 'CALLED', toStatus: 'SERVING' });
});
test('L7-004 Operator B completes a Queue R customer started by A', async () => {
  const { entry } = await f.join();
  expect((await call(f.r.id, a)).status).toBe(200);
  expect((await action(entry.id, 'start-service', a)).status).toBe(200);
  const response = await action(entry.id, 'complete', b);
  expect(response.status).toBe(200);
  expect(response.body.data.status).toBe('COMPLETED');
  expect(await db.queueEvent.findFirst({ where: { entryId: entry.id, eventType: 'COMPLETED' } })).toMatchObject({ actorId: b.id });
});
for (const code of ['R', 'S'] as const) {
  for (const triple of ['AAA', 'AAB', 'ABA', 'ABB', 'BAA', 'BAB', 'BBA', 'BBB']) {
    test(`L7-005 seeded ${triple} handoff in Queue ${code} retains each actual actor`, async () => {
      const queue = code === 'R' ? f.r : f.s;
      const actors = [...triple].map(letter => letter === 'A' ? a : b);
      const { customer, entry } = await f.join(queue);
      expect((await call(queue.id, actors[0])).status).toBe(200);
      expect((await action(entry.id, 'start-service', actors[1])).status).toBe(200);
      expect((await action(entry.id, 'complete', actors[2])).status).toBe(200);
      const events = await db.queueEvent.findMany({ where: { entryId: entry.id } });
      for (const [i, eventType] of ['CALLED', 'STARTED', 'COMPLETED'].entries()) expect(events.find(e => e.eventType === eventType)?.actorId).toBe(actors[i].id);
      expect(events).toHaveLength(4);
      expect((await get(`/customer/entries/${entry.id}`, customer)).body.data.status).toBe('COMPLETED');
    });
  }
}

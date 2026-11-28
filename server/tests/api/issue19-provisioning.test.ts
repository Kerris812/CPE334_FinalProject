import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { db, lab7Fixture, setup, snapshot, type Lab7Fixture } from '../support/lab7-fixture.js';
let f: Lab7Fixture;
beforeAll(setup);
beforeEach(async () => { f = await lab7Fixture(); });
afterEach(async () => { await f.clean(); });
afterAll(() => db.$disconnect());

test('S2-TEST-18: repeat provisioning preserves counter IDs, four operator pairs and operational history', async () => {
  const a = await f.seeded('a'); const b = await f.seeded('b');
  const entry = await f.entry();
  await db.queueEvent.create({ data: { entryId: entry.id, actorId: f.customer.id, eventType: 'JOINED', toStatus: 'WAITING' } });
  const before = await snapshot();
  await seed(db);
  const once = await db.serviceCounter.findMany({ orderBy: { code: 'asc' } });
  expect(once).toEqual([
    expect.objectContaining({ code: 'R', name: 'Counter R', queueId: f.r.id }),
    expect.objectContaining({ code: 'S', name: 'Counter S', queueId: f.s.id }),
  ]);
  await seed(db);
  expect(await db.serviceCounter.findMany({ orderBy: { code: 'asc' } })).toEqual(once);
  expect(await snapshot()).toEqual(before);
  expect(await db.operatorQueueAssignment.count({ where: { operatorId: { in: [a.id, b.id] }, queueId: { in: [f.r.id, f.s.id] } } })).toBe(4);
});

test('S2-TEST-18: provisioning creates a missing counter without changing the compatible peer', async () => {
  const r = await db.serviceCounter.findUniqueOrThrow({ where: { code: 'R' } });
  await db.serviceCounter.delete({ where: { code: 'S' } });
  await seed(db);
  expect(await db.serviceCounter.findUniqueOrThrow({ where: { code: 'R' } })).toEqual(r);
  expect(await db.serviceCounter.findUniqueOrThrow({ where: { code: 'S' } })).toMatchObject({ name: 'Counter S', queueId: f.s.id });
});

test.each(['queue', 'name'] as const)('S2-TEST-18: incompatible counter %s fails nondestructively', async field => {
  const counter = await db.serviceCounter.findUniqueOrThrow({ where: { code: 'R' } });
  await db.serviceCounter.update({ where: { id: counter.id }, data: field === 'queue' ? { queueId: f.s.id } : { name: 'Unexpected configuration' } });
  const before = await snapshot(); const counters = await db.serviceCounter.findMany({ orderBy: { code: 'asc' } });
  try {
    await expect(seed(db)).rejects.toThrow('counter');
    expect(await snapshot()).toEqual(before);
    expect(await db.serviceCounter.findMany({ orderBy: { code: 'asc' } })).toEqual(counters);
  } finally { await db.serviceCounter.update({ where: { id: counter.id }, data: { queueId: counter.queueId, name: counter.name } }); }
});

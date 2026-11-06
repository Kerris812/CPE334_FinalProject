import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { verify } from 'argon2';
import { afterAll, expect, test } from 'vitest';
import { seed } from '../../prisma/seed.js';
import { testDatabaseUrl } from '../../src/infrastructure/test-database.js';

testDatabaseUrl(process.env.TEST_DATABASE_URL, undefined);
const db = new PrismaClient();
afterAll(() => db.$disconnect());
const env = process.env as NodeJS.ProcessEnv & { DEMO_CUSTOMER_PASSWORD: string; DEMO_OPERATOR_PASSWORD: string };
if (!env.DEMO_CUSTOMER_PASSWORD || !env.DEMO_OPERATOR_PASSWORD) throw new Error('Local synthetic seed passwords are required.');

test('TEST-009 migrations and seed repeat without duplicate records or resetting state', async () => {
  // This suite expects its own initially empty disposable database, and never truncates data.
  for (let i = 0; i < 2; i++) {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
    await seed(db, env);
  }
  expect(await db.user.count()).toBe(4);
  expect(await db.queue.count()).toBe(1);
  expect(await db.operatorQueueAssignment.count()).toBe(1);
  const queue = await db.queue.findUniqueOrThrow({ where: { code: 'R' } });
  expect(queue.state).toBe('OPEN');
  const users = await db.user.findMany({ orderBy: { email: 'asc' } });
  for (const user of users) {
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(user.passwordHash, user.role === 'CUSTOMER' ? env.DEMO_CUSTOMER_PASSWORD : env.DEMO_OPERATOR_PASSWORD)).toBe(true);
  }
  const assignment = await db.operatorQueueAssignment.findFirstOrThrow({ include: { operator: true } });
  expect(assignment.operator.email).toBe('operator.a@example.test');
  expect(assignment.queueId).toBe(queue.id);
  const before = users.map(u => [u.id, u.passwordHash]);
  await db.queue.update({ where: { id: queue.id }, data: { lastSequence: 9999n, state: 'PAUSED' } });
  try {
    await seed(db, env);
    expect((await db.queue.findUniqueOrThrow({ where: { id: queue.id } })).lastSequence).toBe(9999n);
    expect((await db.queue.findUniqueOrThrow({ where: { id: queue.id } })).state).toBe('PAUSED');
    expect((await db.user.findMany({ orderBy: { email: 'asc' } })).map(u => [u.id, u.passwordHash])).toEqual(before);
    await db.$disconnect();
    const reconnected = new PrismaClient();
    try { expect(await reconnected.user.count()).toBe(4); } finally { await reconnected.$disconnect(); }
  } finally {
    await db.queue.update({ where: { id: queue.id }, data: { lastSequence: queue.lastSequence, state: queue.state } });
  }
}, 30000);

test('database constraints enforce active customer, service slot, party size and foreign keys', async () => {
  const customer = await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } });
  const other = await db.user.findUniqueOrThrow({ where: { email: 'customer.b@example.test' } });
  const queue = await db.queue.findUniqueOrThrow({ where: { code: 'R' } });
  const ids: string[] = [];
  const create = (customerId: string, sequence: bigint, status: 'WAITING' | 'CALLED', partySize = 4, queueId = queue.id) => db.queueEntry.create({ data: { customerId, queueId, sequence, displayNumber: `FIX-${randomUUID().slice(0, 20)}`, status, partySize } });
  try {
    const first = await create(customer.id, 100001n, 'CALLED'); ids.push(first.id);
    await expect(create(customer.id, 100002n, 'WAITING')).rejects.toMatchObject({ code: 'P2002' });
    await expect(create(other.id, 100002n, 'CALLED')).rejects.toMatchObject({ code: 'P2002' });
    await expect(create(other.id, 100002n, 'WAITING', 9)).rejects.toThrow();
    await expect(create(other.id, 100002n, 'WAITING', 4, randomUUID())).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.queueEntry.create({ data: { customerId: other.id, queueId: queue.id, sequence: first.sequence, displayNumber: `FIX-${randomUUID().slice(0,20)}`, partySize: 4 } })).rejects.toMatchObject({ code: 'P2002' });
  } finally { await db.queueEntry.deleteMany({ where: { id: { in: ids } } }); }
});

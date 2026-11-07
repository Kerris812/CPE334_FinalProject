import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type EntryStatus, type Queue } from '@prisma/client';
import { testDatabaseUrl } from '../../src/infrastructure/test-database.js';
import { seed } from '../../prisma/seed.js';
export const origin = 'http://127.0.0.1:5173';
export const db = new PrismaClient();
export async function setup() { testDatabaseUrl(process.env.TEST_DATABASE_URL, undefined); await seed(db); }
export async function fixture() {
  const users: string[] = []; const queues: string[] = [];
  const passwordHash = (await db.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } })).passwordHash;
  async function actor(role: 'CUSTOMER' | 'OPERATOR' = 'CUSTOMER') {
    const user = await db.user.create({ data: { email: `queue-${randomUUID()}@example.test`, displayName: 'Queue fixture guest', role, passwordHash } }); users.push(user.id);
    const token = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, cookie: `qs_session=${token}` };
  }
  async function queue() {
    const row = await db.queue.create({ data: { code: `T${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`, name: 'Queue fixture restaurant' } }); queues.push(row.id); return row;
  }
  const customer = await actor();
  const initial = await db.queue.findUniqueOrThrow({ where: { code: 'R' } });
  const snapshots = new Map<string, Queue>([[initial.id, initial]]);
  async function seeded(code: string) { const row = await db.queue.findUniqueOrThrow({ where: { code } }); if (!snapshots.has(row.id)) snapshots.set(row.id, row); return row; }
  const f = {
    customer, queue: initial, actor, newQueue: queue,
    async useR() { f.queue = await seeded('R'); },
    async useS() { return seeded('S'); },
    async entry(status: EntryStatus = 'WAITING', who = customer, target = f.queue, sequence = 1n) {
      return db.queueEntry.create({ data: { customerId: who.id, queueId: target.id, partySize: 4, status, sequence, displayNumber: `${target.code}-${sequence.toString().padStart(4, '0')}` } });
    },
    async state() {
      return { queues: await db.queue.findMany({ where: { id: { in: [...snapshots.keys(), ...queues] } }, orderBy: { id: 'asc' } }), entries: await db.queueEntry.findMany({ where: { customerId: { in: users } }, orderBy: { id: 'asc' } }), events: await db.queueEvent.findMany({ where: { entry: { customerId: { in: users } } }, orderBy: { id: 'asc' } }) };
    },
    async clean() {
      await db.queueEvent.deleteMany({ where: { entry: { customerId: { in: users } } } });
      await db.queueEntry.deleteMany({ where: { customerId: { in: users } } });
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.operatorQueueAssignment.deleteMany({ where: { operatorId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.queue.deleteMany({ where: { id: { in: queues } } });
      for (const row of snapshots.values()) await db.queue.update({ where: { id: row.id }, data: { lastSequence: row.lastSequence, state: row.state } });
    },
  };
  return f;
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;

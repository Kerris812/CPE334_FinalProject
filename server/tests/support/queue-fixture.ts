import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type EntryStatus, type Queue, type QueueEntry } from '@prisma/client';
import { testDatabaseUrl } from '../../src/infrastructure/test-database.js';
import { seed } from '../../prisma/seed.js';
export const origin = 'http://127.0.0.1:5173';
export const db = new PrismaClient();
export async function setup() { testDatabaseUrl(process.env.TEST_DATABASE_URL, undefined); await seed(db); }
export async function fixture(client = db) {
  const users: string[] = []; const queues: string[] = [];
  const passwordHash = (await client.user.findUniqueOrThrow({ where: { email: 'customer.a@example.test' } })).passwordHash;
  async function actor(role: 'CUSTOMER' | 'OPERATOR' = 'CUSTOMER') {
    const user = await client.user.create({ data: { email: `queue-${randomUUID()}@example.test`, displayName: 'Queue fixture guest', role, passwordHash } }); users.push(user.id);
    const token = randomBytes(32).toString('base64url');
    await client.session.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, cookie: `qs_session=${token}` };
  }
  async function queue() {
    const row = await client.queue.create({ data: { code: `T${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`, name: 'Queue fixture restaurant' } }); queues.push(row.id); return row;
  }
  const customer = await actor();
  const initial = await client.queue.findUniqueOrThrow({ where: { code: 'R' } });
  const snapshots = new Map<string, Queue>([[initial.id, initial]]);
  async function seeded(code: string) { const row = await client.queue.findUniqueOrThrow({ where: { code } }); if (!snapshots.has(row.id)) snapshots.set(row.id, row); return row; }
  const f = {
    customer, queue: initial, actor, newQueue: queue,
    async useR(): Promise<void> { f.queue = await seeded('R'); },
    async useS() { return seeded('S'); },
    async entry(status: EntryStatus = 'WAITING', who = customer, target?: Queue, sequence = 1n): Promise<QueueEntry> {
      target ??= f.queue;
      return db.queueEntry.create({ data: { customerId: who.id, queueId: target.id, partySize: 4, status, sequence, displayNumber: `${target.code}-${sequence.toString().padStart(4, '0')}` } });
    },
    async state() {
      return { queues: await client.queue.findMany({ where: { id: { in: [...snapshots.keys(), ...queues] } }, orderBy: { id: 'asc' } }), entries: await client.queueEntry.findMany({ where: { customerId: { in: users } }, orderBy: { id: 'asc' } }), events: await client.queueEvent.findMany({ where: { entry: { customerId: { in: users } } }, orderBy: { id: 'asc' } }) };
    },
    async clean() {
      await client.queueEvent.deleteMany({ where: { entry: { customerId: { in: users } } } });
      await client.queueEntry.deleteMany({ where: { customerId: { in: users } } });
      await client.session.deleteMany({ where: { userId: { in: users } } });
      await client.operatorQueueAssignment.deleteMany({ where: { operatorId: { in: users } } });
      await client.user.deleteMany({ where: { id: { in: users } } });
      await client.queue.deleteMany({ where: { id: { in: queues } } });
      for (const row of snapshots.values()) await client.queue.update({ where: { id: row.id }, data: { lastSequence: row.lastSequence, state: row.state } });
    },
  };
  return f;
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;

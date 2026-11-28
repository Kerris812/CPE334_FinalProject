import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { testDatabaseUrl } from '../../src/infrastructure/test-database.js';
import { seed } from '../../prisma/seed.js';

const base = testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const admin = new PrismaClient({ datasourceUrl: base });
let db: PrismaClient;
let url: string;
let name: string;
const migration = 'prisma/migrations/0003_service_counters/migration.sql';
function sql(input: string) {
  return execFileSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
beforeEach(async () => {
  name = `issue19_migration_${randomUUID().replaceAll('-', '')}_test`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const target = new URL(base); target.pathname = `/${name}`; url = target.toString();
  db = new PrismaClient({ datasourceUrl: url });
  sql(readFileSync('prisma/migrations/0001_foundation/migration.sql', 'utf8'));
  sql(readFileSync('prisma/migrations/0002_immutable_queue_sequence/migration.sql', 'utf8'));
  sql(`INSERT INTO users(id,email,display_name,password_hash,role) SELECT md5('user'||n)::uuid, CASE n WHEN 1 THEN 'customer.a@example.test' WHEN 2 THEN 'customer.b@example.test' WHEN 7 THEN 'operator.a@example.test' WHEN 8 THEN 'operator.b@example.test' ELSE 'migration'||n||'@example.test' END,'Synthetic migration','synthetic',CASE WHEN n>6 THEN 'OPERATOR'::"Role" ELSE 'CUSTOMER'::"Role" END FROM generate_series(1,8) n;
    INSERT INTO queues(id,code,name,last_sequence) VALUES(md5('R')::uuid,'R','Queue R',42),(md5('S')::uuid,'S','Queue S',87);
    INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(md5('session')::uuid,md5('user1')::uuid,repeat('a',64),now()+interval '1 hour');
    INSERT INTO operator_queue_assignments(operator_id,queue_id) SELECT u.id,q.id FROM users u CROSS JOIN queues q WHERE role='OPERATOR';
    INSERT INTO queue_entries(id,queue_id,customer_id,sequence,display_number,party_size,status,called_at,serving_at) SELECT md5('entry'||n)::uuid,md5(CASE WHEN n=3 THEN 'S' ELSE 'R' END)::uuid,md5('user'||n)::uuid,n,'M-'||n,2,(ARRAY['WAITING','CALLED','SERVING','COMPLETED','CANCELLED','NO_SHOW'])[n]::"EntryStatus",CASE WHEN n IN(2,3) THEN '2026-11-01T00:00:00Z'::timestamptz END,CASE WHEN n=3 THEN '2026-11-01T00:01:00Z'::timestamptz END FROM generate_series(1,6) n;
    INSERT INTO queue_events(id,entry_id,actor_id,event_type,to_status) SELECT md5('event'||n)::uuid,md5('entry'||n)::uuid,md5('user7')::uuid,'LEGACY',status FROM queue_entries e JOIN generate_series(1,6) n ON e.id=md5('entry'||n)::uuid;`);
});
afterEach(async () => {
  await db?.$disconnect();
  if (name) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
});
async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ['users', 'sessions', 'queues', 'operator_queue_assignments', 'queue_entries', 'queue_events']) {
    result[table] = await db.$queryRawUnsafe(`SELECT to_jsonb(t) - 'counter_id' AS row FROM ${table} t ORDER BY to_jsonb(t)::text`);
  }
  return result;
}

test('S2-TEST-18: populated migration preserves all six states, identities, timestamps, sessions, sequences and audit', async () => {
  const before = await snapshot();
  sql(readFileSync(migration, 'utf8'));
  expect(await snapshot()).toEqual(before);
  expect(await db.$queryRawUnsafe('SELECT code,name FROM service_counters ORDER BY code')).toEqual([{ code: 'R', name: 'Counter R' }, { code: 'S', name: 'Counter S' }]);
  expect(await db.$queryRawUnsafe(`SELECT e.status::text,c.code FROM queue_entries e JOIN service_counters c ON c.id=e.counter_id ORDER BY e.sequence`)).toEqual([{ status: 'CALLED', code: 'R' }, { status: 'SERVING', code: 'S' }]);
  expect(await db.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE indexname='queue_entries_one_service_slot'`)).toHaveLength(1);
  const counters = await db.serviceCounter.findMany({ orderBy: { code: 'asc' } });
  await seed(db); await seed(db);
  expect(await snapshot()).toEqual(before);
  expect(await db.serviceCounter.findMany({ orderBy: { code: 'asc' } })).toEqual(counters);
  if (process.env.ISSUE19_MIGRATION_EVIDENCE) writeFileSync(process.env.ISSUE19_MIGRATION_EVIDENCE, JSON.stringify({ preservedCounts: Object.fromEntries(Object.entries(before).map(([table, rows]) => [table, (rows as unknown[]).length])), countersBeforeRepeatedSeed: counters, countersAfterRepeatedSeed: await db.serviceCounter.findMany({ orderBy: { code: 'asc' } }), activeBackfill: await db.$queryRawUnsafe(`SELECT e.status::text,c.code FROM queue_entries e JOIN service_counters c ON c.id=e.counter_id ORDER BY e.sequence`), sequences: await db.$queryRawUnsafe('SELECT code,last_sequence::text FROM queues ORDER BY code') }, null, 2));
});

test('S2-TEST-16: PostgreSQL enforces counter identity, active association, queue linkage and both capacities', async () => {
  sql(readFileSync(migration, 'utf8'));
  const before = await snapshot();
  await expect(db.$executeRawUnsafe(`INSERT INTO service_counters(id,code,name,queue_id) SELECT gen_random_uuid(),code,name,queue_id FROM service_counters WHERE code='R'`)).rejects.toMatchObject({ meta: { code: '23505' } });
  await expect(db.$executeRawUnsafe(`UPDATE queue_entries SET counter_id=NULL WHERE status='CALLED'`)).rejects.toMatchObject({ meta: { code: '23514' } });
  await expect(db.$executeRawUnsafe(`UPDATE queue_entries SET counter_id=(SELECT id FROM service_counters WHERE code='S') WHERE status='COMPLETED'`)).rejects.toMatchObject({ meta: { code: '23503' } });
  await expect(db.$executeRawUnsafe(`UPDATE queue_entries SET status='CALLED',counter_id=(SELECT id FROM service_counters WHERE code='R') WHERE status='WAITING'`)).rejects.toMatchObject({ meta: { code: '23505' } });
  await expect(db.$executeRawUnsafe(`UPDATE queue_entries SET counter_id=(SELECT id FROM service_counters WHERE code='R') WHERE status='WAITING'`)).rejects.toMatchObject({ meta: { code: '23514' } });
  await expect(db.$executeRawUnsafe(`UPDATE queue_entries SET counter_id=(SELECT id FROM service_counters WHERE code='R') WHERE status='CANCELLED'`)).rejects.toMatchObject({ meta: { code: '23514' } });
  expect(await snapshot()).toEqual(before);
  await db.$executeRawUnsafe(`UPDATE queue_entries SET status='COMPLETED' WHERE status='CALLED'`);
  await db.$executeRawUnsafe(`UPDATE queue_entries SET status='CALLED',counter_id=(SELECT id FROM service_counters WHERE code='R') WHERE status='WAITING'`);
  expect(await db.$queryRawUnsafe(`SELECT counter_id FROM queue_entries WHERE status='COMPLETED' AND counter_id IS NOT NULL`)).toHaveLength(1);
});

test('S2-TEST-16: the counter index independently rejects duplicates and the queue index rejects a second counter', async () => {
  sql(readFileSync(migration, 'utf8'));
  await expect(db.$transaction(async tx => {
    await tx.$executeRawUnsafe('DROP INDEX queue_entries_one_service_slot');
    await tx.$executeRawUnsafe(`UPDATE queue_entries SET status='CALLED',counter_id=(SELECT id FROM service_counters WHERE code='R') WHERE status='WAITING'`);
  })).rejects.toMatchObject({ meta: { code: '23505' } });
  await db.$executeRawUnsafe(`INSERT INTO service_counters(id,code,name,queue_id) VALUES(md5('extra')::uuid,'EXTRA','Synthetic alternative',md5('R')::uuid)`);
  await expect(db.$executeRawUnsafe(`UPDATE queue_entries SET status='CALLED',counter_id=md5('extra')::uuid WHERE status='WAITING'`)).rejects.toMatchObject({ meta: { code: '23505' } });
  expect(await db.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE indexname='queue_entries_one_service_slot'`)).toHaveLength(1);
});

test('S2-TEST-18: an unsupported active legacy queue aborts without partial schema changes', async () => {
  await db.$executeRawUnsafe(`INSERT INTO queues(id,code,name) VALUES(md5('X')::uuid,'X','Synthetic unsupported queue')`);
  await db.$executeRawUnsafe(`INSERT INTO queue_entries(id,queue_id,customer_id,sequence,display_number,party_size,status,called_at) VALUES(md5('unsupported')::uuid,md5('X')::uuid,md5('user4')::uuid,1,'X-0001',2,'CALLED',now())`);
  const before = await snapshot();
  expect(() => sql(readFileSync(migration, 'utf8'))).toThrow();
  expect(await snapshot()).toEqual(before);
  expect(await db.$queryRawUnsafe(`SELECT to_regclass('service_counters')::text AS table_name`)).toEqual([{ table_name: null }]);
});

test.each(['called_at', 'serving_at'])('S2-TEST-18: invalid legacy %s aborts the entire migration', async field => {
  await db.$executeRawUnsafe(`UPDATE queue_entries SET ${field}=NULL WHERE status='${field === 'called_at' ? 'CALLED' : 'SERVING'}'`);
  const before = await snapshot();
  expect(() => sql(readFileSync(migration, 'utf8'))).toThrow();
  expect(await snapshot()).toEqual(before);
  expect(await db.$queryRawUnsafe(`SELECT to_regclass('service_counters')::text AS table_name`)).toEqual([{ table_name: null }]);
});

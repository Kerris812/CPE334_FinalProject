import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { action, call, db, get, lab7Fixture, rejected, setup, type Lab7Fixture } from '../support/lab7-fixture.js';
let f: Lab7Fixture;
beforeAll(setup);
beforeEach(async () => { f = await lab7Fixture(); });
afterEach(async () => { await f.clean(); });
afterAll(() => db.$disconnect());
test.each(['call', 'complete'] as const)('S2-TEST-27: audit unique violation during %s is INTERNAL_ERROR with atomic rollback', async stage => {
  const operator = await f.seeded('a'); const { entry } = await f.join();
  if (stage === 'complete') { await call(f.r.id, operator); await action(entry.id, 'start-service', operator); }
  const before = (await get(`/operator/queues/${f.r.id}/desk`, operator)).body.data.counter;
  await db.$executeRawUnsafe(`CREATE FUNCTION issue19_unique_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id='${operator.id}'::uuid THEN RAISE unique_violation USING MESSAGE='Synthetic audit unique failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER issue19_unique_audit_failure BEFORE INSERT ON queue_events FOR EACH ROW EXECUTE FUNCTION issue19_unique_audit_failure()');
  try {
    await rejected(() => stage === 'call' ? call(f.r.id, operator) : action(entry.id, 'complete', operator), 'INTERNAL_ERROR', 500);
    expect((await get(`/operator/queues/${f.r.id}/desk`, operator)).body.data.counter).toEqual(before);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER issue19_unique_audit_failure ON queue_events');
    await db.$executeRawUnsafe('DROP FUNCTION issue19_unique_audit_failure()');
  }
  const retry = stage === 'call' ? await call(f.r.id, operator) : await action(entry.id, 'complete', operator);
  expect(retry.status).toBe(200);
  expect(await db.queueEvent.count({ where: { entryId: entry.id, eventType: stage === 'call' ? 'CALLED' : 'COMPLETED' } })).toBe(1);
});

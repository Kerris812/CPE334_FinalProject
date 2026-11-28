import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash, argon2id } from 'argon2';

export async function seed(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  const customerPassword = env.DEMO_CUSTOMER_PASSWORD;
  const operatorPassword = env.DEMO_OPERATOR_PASSWORD;
  if (!customerPassword || !operatorPassword) throw new Error('Set DEMO_CUSTOMER_PASSWORD and DEMO_OPERATOR_PASSWORD in ignored local environment.');
  const customerHash = await hash(customerPassword, { type: argon2id });
  const operatorHash = await hash(operatorPassword, { type: argon2id });
  await db.$transaction(async tx => {
    const queue = await tx.queue.upsert({ where: { code: 'R' }, update: {}, create: { code: 'R', name: 'Restaurant Waiting Queue', state: 'OPEN' } });
    const largeQueue = await tx.queue.upsert({ where: { code: 'S' }, update: {}, create: { code: 'S', name: 'Large Party Waiting Queue', state: 'OPEN' } });
    for (const target of [queue, largeQueue]) {
      const counter = await tx.serviceCounter.upsert({ where: { code: target.code }, update: {}, create: { code: target.code, name: `Counter ${target.code}`, queueId: target.id } });
      if (counter.queueId !== target.id || counter.name !== `Counter ${target.code}`) throw new Error('Seed counter configuration conflicts with existing data.');
    }
    for (const [email, displayName, role, passwordHash] of [
      ['customer.a@example.test', 'Customer A', 'CUSTOMER', customerHash],
      ['customer.b@example.test', 'Customer B', 'CUSTOMER', customerHash],
      ['operator.a@example.test', 'Operator A', 'OPERATOR', operatorHash],
      ['operator.b@example.test', 'Operator B', 'OPERATOR', operatorHash],
    ] as const) {
      // Existing passwords, account flags, queue state and counters are never reset.
      const user = await tx.user.upsert({ where: { email }, update: {}, create: { email, displayName, role, passwordHash } });
      if (user.role !== role) throw new Error('Seed account role conflicts with existing data.');
      if (role === 'OPERATOR') {
        const approved = [queue, largeQueue];
        if (await tx.operatorQueueAssignment.findFirst({ where: { operatorId: user.id, queueId: { notIn: approved.map(target => target.id) } } })) throw new Error('Seed operator assignment conflicts with the approved queue scope; existing assignments were preserved.');
        for (const target of approved) {
          await tx.operatorQueueAssignment.upsert({ where: { operatorId_queueId: { operatorId: user.id, queueId: target.id } }, update: {}, create: { operatorId: user.id, queueId: target.id } });
        }
      }
    }
  });
}

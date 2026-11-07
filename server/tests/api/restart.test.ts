import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { expect, test } from 'vitest';

async function start() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: '3001' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('API exited before becoming ready');
      try { if ((await fetch('http://127.0.0.1:3001/health')).ok) return child; } catch { /* wait for listener */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('API startup timeout');
  } catch (error) { child.kill(); throw error; }
}
async function stop(child: ChildProcess) {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('foundation seed identities and counter survive an actual API process restart', async () => {
  const db = new PrismaClient();
  const snapshot = async () => ({
    users: await db.user.findMany({ orderBy: { id: 'asc' } }),
    queues: await db.queue.findMany({ orderBy: { id: 'asc' } }),
    assignments: await db.operatorQueueAssignment.findMany(),
  });
  try {
    const before = await snapshot();
    expect(before.users).toHaveLength(4);
    const first = await start(); await stop(first);
    const second = await start();
    try { expect(await snapshot()).toEqual(before); } finally { await stop(second); }
  } finally { await db.$disconnect(); }
}, 15000);

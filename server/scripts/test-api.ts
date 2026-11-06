import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { testDatabaseUrl } from '../src/infrastructure/test-database.js';
const databaseUrl = testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const env = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' };
for (const args of [['prisma', 'migrate', 'deploy'], ['vitest', 'run', 'tests/api', '--maxWorkers=1', '--no-file-parallelism', ...process.argv.slice(2)]]) {
  const result = spawnSync('npx', args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

import 'dotenv/config';
import { createApp } from './app.js';
import { database } from './infrastructure/database.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
try {
  await database.$connect();
  await database.$queryRaw`SELECT 1`;
  const server = createApp().listen(port, () => console.info(`Restaurant queue API listening on port ${port}`));
  const shutdown = () => server.close(() => { void database.$disconnect().then(() => process.exit(0)); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  console.error('API startup failed: check PostgreSQL availability and server environment configuration.');
  await database.$disconnect();
  process.exitCode = 1;
}

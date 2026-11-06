import 'dotenv/config';
import { testDatabaseUrl } from '../src/infrastructure/test-database.js';
process.env.DATABASE_URL = testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
process.env.NODE_ENV = 'test';
await import('../src/index.js');

import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed.js';
const db = new PrismaClient();
try { await seed(db); console.info('Synthetic seed complete.'); }
catch { console.error('Seed failed: check local passwords, PostgreSQL and seed account roles.'); process.exitCode = 1; }
finally { await db.$disconnect(); }

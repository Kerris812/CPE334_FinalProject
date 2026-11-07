import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { currentUser } from '../authorization/guards.js';
import { joinQueue, readCustomerEntry } from './service.js';
import { readPublicBoard } from '../public-board/service.js';
/** These private routers mount after the existing session, role and origin guards. */
export function queueRoutes(db: PrismaClient) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const queues = await db.queue.findMany({ where: { state: 'OPEN' }, select: { id: true, code: true, name: true, state: true }, orderBy: { code: 'asc' } });
    res.json({ data: queues });
  });
  router.post('/:queueId/entries', async (req, res) => { res.status(201).json({ data: await joinQueue(db, currentUser(res).id, req.params.queueId, req.body) }); });
  return router;
}
export function customerEntryRoutes(db: PrismaClient) {
  const router = Router();
  router.get('/latest', async (_req, res) => { res.json({ data: await readCustomerEntry(db, currentUser(res).id) }); });
  router.get('/:entryId', async (req, res) => { res.json({ data: await readCustomerEntry(db, currentUser(res).id, String(req.params.entryId)) }); });
  return router;
}
export function publicBoardRoutes(db: PrismaClient) {
  const router = Router();
  router.get('/:queueId/board', async (req, res) => { res.json({ data: await readPublicBoard(db, req.params.queueId) }); });
  return router;
}

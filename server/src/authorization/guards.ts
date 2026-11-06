import type { PrismaClient, Role } from '@prisma/client';
import type { RequestHandler, Response } from 'express';
import { ApiError } from '../http/errors.js';

interface Principal { id: string; displayName: string; role: Role }
export function currentUser(res: Response): Principal {
  if (!res.locals.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return res.locals.user as Principal;
}
function roleUser(res: Response, role: Role): Principal {
  const user = currentUser(res);
  if (user.role !== role) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  return user;
}
export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => { roleUser(res, role); next(); };
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const entryNotFound = () => new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
const queueDenied = () => new ApiError(403, 'QUEUE_ACCESS_DENIED', 'You do not have permission to access this queue.');
async function assigned(db: PrismaClient, operatorId: string, queueId: unknown) {
  if (!uuid(queueId)) throw queueDenied();
  const assignment = await db.operatorQueueAssignment.findUnique({ where: { operatorId_queueId: { operatorId, queueId } }, select: { queueId: true } });
  if (!assignment) throw queueDenied();
}
/** Mount after authentication and role middleware; also fails closed if misordered. */
export function requireQueueAssignment(db: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const user = roleUser(res, 'OPERATOR');
    await assigned(db, user.id, req.params.queueId);
    next();
  };
}
/** Entry actions derive the queue from stored data, not a body/header queueId. */
export function requireEntryAssignment(db: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const user = roleUser(res, 'OPERATOR');
    if (!uuid(req.params.entryId)) throw entryNotFound();
    const entry = await db.queueEntry.findUnique({ where: { id: req.params.entryId }, select: { queueId: true } });
    if (!entry) throw entryNotFound();
    await assigned(db, user.id, entry.queueId);
    next();
  };
}
/** Foreign and absent entries share one query and the same nonleaking 404. */
export function requireOwnedEntry(db: PrismaClient): RequestHandler {
  return async (req, res, next) => {
    const user = roleUser(res, 'CUSTOMER');
    if (!uuid(req.params.entryId)) throw entryNotFound();
    const entry = await db.queueEntry.findFirst({ where: { id: req.params.entryId, customerId: user.id }, select: { id: true } });
    if (!entry) throw entryNotFound();
    next();
  };
}

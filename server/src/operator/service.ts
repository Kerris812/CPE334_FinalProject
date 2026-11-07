import { Prisma, type PrismaClient, type QueueEntry } from '@prisma/client';
import { ApiError } from '../http/errors.js';
import { canTransition } from '../queues/rules.js';
const conflict = (code: string, message: string) => new ApiError(409, code, message);
const denied = () => new ApiError(403, 'QUEUE_ACCESS_DENIED', 'You do not have permission to access this queue.');
const operationalSelect = { id: true, displayNumber: true, partySize: true, status: true, calledAt: true, servingAt: true, completedAt: true } satisfies Prisma.QueueEntrySelect;
function entryDto(entry: QueueEntry) { return { id: entry.id, displayNumber: entry.displayNumber, partySize: entry.partySize, status: entry.status, calledAt: entry.calledAt, servingAt: entry.servingAt, completedAt: entry.completedAt }; }
async function authorize(tx: Prisma.TransactionClient, operatorId: string, queueId: string) {
  const operator = await tx.user.findUnique({ where: { id: operatorId }, select: { role: true, isActive: true } });
  if (!operator?.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  if (operator.role !== 'OPERATOR') throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  // Hold the assignment through commit so a concurrent revocation cannot bypass scope.
  const assignments = await tx.$queryRaw<{ queueId: string }[]>`SELECT queue_id AS "queueId" FROM operator_queue_assignments WHERE operator_id = ${operatorId}::uuid AND queue_id = ${queueId}::uuid FOR SHARE`;
  if (!assignments.length) throw denied();
}
export async function readDesk(db: PrismaClient, operatorId: string, queueId: string) {
  return db.$transaction(async tx => {
    await authorize(tx, operatorId, queueId);
    const queue = await tx.queue.findUniqueOrThrow({ where: { id: queueId }, select: { id: true, code: true, state: true } });
    const waitingCount = await tx.queueEntry.count({ where: { queueId, status: 'WAITING' } });
    const activeEntry = await tx.queueEntry.findFirst({ where: { queueId, status: { in: ['CALLED', 'SERVING'] } }, select: operationalSelect });
    const nextWaiting = await tx.queueEntry.findFirst({ where: { queueId, status: 'WAITING' }, orderBy: { sequence: 'asc' }, select: { id: true, displayNumber: true, partySize: true, status: true } });
    return { queue, waitingCount, activeEntry, nextWaiting };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
/** All service writers lock the queue first, matching join's queue lock. */
export async function operate(db: PrismaClient, operatorId: string, target: { queueId: string } | { entryId: string; to: 'SERVING' | 'COMPLETED' }) {
  return db.$transaction(async tx => {
    const existing = 'entryId' in target ? await tx.queueEntry.findUnique({ where: { id: target.entryId }, select: { queueId: true } }) : null;
    if ('entryId' in target && !existing) throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
    const queueId = 'queueId' in target ? target.queueId : existing!.queueId;
    await tx.$queryRaw`SELECT id FROM queues WHERE id = ${queueId}::uuid FOR UPDATE`;
    await authorize(tx, operatorId, queueId);
    const to = 'queueId' in target ? 'CALLED' : target.to;
    let entry: QueueEntry | null;
    if ('queueId' in target) {
      const queue = await tx.queue.findUniqueOrThrow({ where: { id: queueId } });
      if (queue.state !== 'OPEN') throw conflict('QUEUE_NOT_OPEN', 'This queue is not open.');
      if (await tx.queueEntry.findFirst({ where: { queueId, status: { in: ['CALLED', 'SERVING'] } }, select: { id: true } })) throw conflict('SERVICE_SLOT_BUSY', 'Finish the active service before calling next.');
      entry = await tx.queueEntry.findFirst({ where: { queueId, status: 'WAITING' }, orderBy: { sequence: 'asc' } });
      if (!entry) throw conflict('QUEUE_EMPTY', 'There are no waiting customers.');
    } else entry = await tx.queueEntry.findUnique({ where: { id: target.entryId } });
    if (!entry) throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
    if (!canTransition(entry.status, to)) throw conflict('INVALID_TRANSITION', 'This queue entry cannot be moved to that status.');
    const at = new Date();
    const updated = await tx.queueEntry.update({ where: { id: entry.id, status: entry.status }, data: { status: to, ...(to === 'CALLED' ? { calledAt: at } : to === 'SERVING' ? { servingAt: at } : { completedAt: at }) } });
    await tx.queueEvent.create({ data: { entryId: entry.id, actorId: operatorId, eventType: to === 'SERVING' ? 'STARTED' : to, fromStatus: entry.status, toStatus: to, occurredAt: at } });
    return entryDto(updated);
  }, { maxWait: 10000, timeout: 10000 });
}

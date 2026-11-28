import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../http/errors.js';
import { validId } from '../queues/rules.js';
import { publicBoardDto } from './dto.js';

export async function readPublicBoard(db: PrismaClient, queueId: unknown) {
  if (queueId !== 'R' && queueId !== 'S' && !validId(queueId)) throw new ApiError(404, 'QUEUE_NOT_FOUND', 'Queue not found.');
  // All reads share one PostgreSQL snapshot, including aggregate count and slot.
  return db.$transaction(async tx => {
    // R/S are stable public links for the seeded restaurant; UUID URLs still work.
    const queue = await tx.queue.findUnique({ where: queueId === 'R' || queueId === 'S' ? { code: queueId } : { id: queueId }, select: { id: true, code: true } });
    if (!queue) throw new ApiError(404, 'QUEUE_NOT_FOUND', 'Queue not found.');
    const current = await tx.queueEntry.findFirst({ where: { queueId: queue.id, status: { in: ['CALLED', 'SERVING'] } }, orderBy: { sequence: 'asc' }, select: { displayNumber: true, status: true, counter: { select: { name: true } } } });
    const waitingCount = await tx.queueEntry.count({ where: { queueId: queue.id, status: 'WAITING' } });
    if (current && !current.counter) throw new ApiError(500, 'INTERNAL_ERROR', 'Service counter association is unavailable.');
    return publicBoardDto(queue, current ? { displayNumber: current.displayNumber, status: current.status, counterLabel: current.counter!.name } : null, waitingCount);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

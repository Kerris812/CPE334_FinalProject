import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../http/errors.js';
import { validId } from '../queues/rules.js';
import { publicBoardDto } from './dto.js';

export async function readPublicBoard(db: PrismaClient, queueId: unknown) {
  if (queueId !== 'R' && !validId(queueId)) throw new ApiError(404, 'QUEUE_NOT_FOUND', 'Queue not found.');
  // All reads share one PostgreSQL snapshot, including aggregate count and slot.
  return db.$transaction(async tx => {
    // R is the stable public link for the seeded restaurant; UUID URLs still work.
    const queue = await tx.queue.findUnique({ where: queueId === 'R' ? { code: 'R' } : { id: queueId }, select: { id: true, code: true } });
    if (!queue) throw new ApiError(404, 'QUEUE_NOT_FOUND', 'Queue not found.');
    const current = await tx.queueEntry.findFirst({ where: { queueId: queue.id, status: { in: ['CALLED', 'SERVING'] } }, select: { displayNumber: true, status: true } });
    const waitingCount = await tx.queueEntry.count({ where: { queueId: queue.id, status: 'WAITING' } });
    return publicBoardDto(queue, current, waitingCount);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

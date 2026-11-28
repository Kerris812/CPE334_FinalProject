import { Prisma, type PrismaClient, type QueueEntry } from '@prisma/client';
import { ApiError } from '../http/errors.js';
import { canTransition, validId } from '../queues/rules.js';
const conflict = (code: string, message: string) => new ApiError(409, code, message);
const denied = () => new ApiError(403, 'QUEUE_ACCESS_DENIED', 'You do not have permission to access this queue.');
const operationalSelect = { id: true, displayNumber: true, partySize: true, status: true, calledAt: true, servingAt: true, completedAt: true, counterId: true, cancelledAt: true, noShowAt: true } satisfies Prisma.QueueEntrySelect;
export function entryDto(entry: QueueEntry) { return { id: entry.id, displayNumber: entry.displayNumber, partySize: entry.partySize, status: entry.status, calledAt: entry.calledAt, servingAt: entry.servingAt, completedAt: entry.completedAt, counterId: entry.counterId, cancelledAt: entry.cancelledAt, noShowAt: entry.noShowAt }; }
export async function authorizeOperator(tx: Prisma.TransactionClient, operatorId: string, queueId: string) {
  const operator = await tx.user.findUnique({ where: { id: operatorId }, select: { role: true, isActive: true } });
  if (!operator?.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  if (operator.role !== 'OPERATOR') throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  // Hold the assignment through commit so a concurrent revocation cannot bypass scope.
  const assignments = await tx.$queryRaw<{ queueId: string }[]>`SELECT queue_id AS "queueId" FROM operator_queue_assignments WHERE operator_id = ${operatorId}::uuid AND queue_id = ${queueId}::uuid FOR SHARE`;
  if (!assignments.length) throw denied();
}
export async function readDesk(db: PrismaClient, operatorId: string, queueId: string, now: () => Date = () => new Date()) {
  return db.$transaction(async tx => {
    await authorizeOperator(tx, operatorId, queueId);
    const queue = await tx.queue.findUniqueOrThrow({ where: { id: queueId }, select: { id: true, code: true, state: true } });
    const waitingCount = await tx.queueEntry.count({ where: { queueId, status: 'WAITING' } });
    const activeEntry = await tx.queueEntry.findFirst({ where: { queueId, status: { in: ['CALLED', 'SERVING'] } }, select: operationalSelect, orderBy: { sequence: 'asc' } });
    const nextWaiting = await tx.queueEntry.findFirst({ where: { queueId, status: 'WAITING' }, orderBy: { sequence: 'asc' }, select: { id: true, displayNumber: true, partySize: true, status: true } });
    const counter = await tx.serviceCounter.findFirst({ where: { queueId }, orderBy: { code: 'asc' } });
    const occupant = counter ? await tx.queueEntry.findFirst({ where: { counterId: counter.id, status: { in: ['CALLED', 'SERVING'] } }, select: { id: true, displayNumber: true, status: true } }) : null;
    return { queue, waitingCount, activeEntry, activeEntries: activeEntry ? [activeEntry] : [], nextWaiting, asOf: now(), counter: counter ? { ...counter, status: occupant ? 'OCCUPIED' : 'AVAILABLE', occupant: occupant ? { entryId: occupant.id, displayNumber: occupant.displayNumber, status: occupant.status } : null } : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
export async function lockEntryCounter(tx: Prisma.TransactionClient, entry: Pick<QueueEntry, 'counterId' | 'queueId'>) {
  if (!entry.counterId) throw new ApiError(500, 'INTERNAL_ERROR', 'Service counter association is unavailable.');
  const rows = await tx.$queryRaw<{ queueId: string }[]>`SELECT queue_id AS "queueId" FROM service_counters WHERE id = ${entry.counterId}::uuid FOR UPDATE`;
  if (rows[0]?.queueId !== entry.queueId) throw new ApiError(500, 'INTERNAL_ERROR', 'Service counter association is unavailable.');
}
function callInput(body: unknown): { counterId?: string; expectedEntryId?: string } {
  if (body === undefined) return {};
  const invalid = () => new ApiError(422, 'VALIDATION_ERROR', 'Check the submitted fields.', { fields: { form: 'Send counterId and optional expectedEntryId UUIDs, or an empty object.' } });
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['counterId', 'expectedEntryId'].includes(key)) ||
      ('counterId' in input && !validId(input.counterId)) ||
      ('expectedEntryId' in input && (!validId(input.expectedEntryId) || !input.counterId))) throw invalid();
  return input as { counterId?: string; expectedEntryId?: string };
}
export async function operate(db: PrismaClient, operatorId: string, target: { queueId: string; body?: unknown } | { entryId: string; to: 'SERVING' | 'COMPLETED' }) {
  try {
    return await db.$transaction(async tx => {
      const existing = 'entryId' in target ? await tx.queueEntry.findUnique({ where: { id: target.entryId }, select: { queueId: true } }) : null;
      if ('entryId' in target && !existing) throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
      const queueId = 'queueId' in target ? target.queueId : existing!.queueId;
      await tx.$queryRaw`SELECT id FROM queues WHERE id = ${queueId}::uuid FOR UPDATE`;
      await authorizeOperator(tx, operatorId, queueId);
      const to = 'queueId' in target ? 'CALLED' : target.to;
      let entry: QueueEntry | null;
      let reservedCounterId: string | undefined;
      if ('queueId' in target) {
        const input = callInput(target.body);
        const queue = await tx.queue.findUniqueOrThrow({ where: { id: queueId } });
        if (queue.state !== 'OPEN') throw conflict('QUEUE_NOT_OPEN', 'This queue is not open.');
        const counter = input.counterId ? await tx.serviceCounter.findUnique({ where: { id: input.counterId } }) : await tx.serviceCounter.findFirst({ where: { queueId }, orderBy: { code: 'asc' } });
        if (!counter || counter.queueId !== queueId) {
          if (input.counterId) throw new ApiError(403, 'COUNTER_ACCESS_DENIED', 'This counter is not available for this queue.');
          throw new ApiError(500, 'INTERNAL_ERROR', 'Service counter configuration is unavailable.');
        }
        await lockEntryCounter(tx, { queueId, counterId: counter.id });
        if (await tx.queueEntry.findFirst({ where: { status: { in: ['CALLED', 'SERVING'] }, OR: [{ queueId }, { counterId: counter.id }] }, select: { id: true } })) throw conflict('SERVICE_SLOT_BUSY', 'Finish the active service before calling next.');
        entry = await tx.queueEntry.findFirst({ where: { queueId, status: 'WAITING' }, orderBy: { sequence: 'asc' } });
        if (input.expectedEntryId && entry?.id !== input.expectedEntryId) throw conflict('QUEUE_HEAD_CHANGED', 'The next waiting entry changed. Refresh and confirm the new head.');
        if (!entry) throw conflict('QUEUE_EMPTY', 'There are no waiting customers.');
        reservedCounterId = counter.id;
      } else {
        entry = await tx.queueEntry.findUnique({ where: { id: target.entryId } });
      }
      if (!entry) throw new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
      if (!canTransition(entry.status, to)) throw conflict('INVALID_TRANSITION', 'This queue entry cannot be moved to that status.');
      if (to !== 'CALLED') await lockEntryCounter(tx, entry);
      const at = new Date();
      const updated = await tx.queueEntry.update({ where: { id: entry.id, status: entry.status }, data: { status: to, ...(to === 'CALLED' ? { calledAt: at, counterId: reservedCounterId } : to === 'SERVING' ? { servingAt: at } : { completedAt: at }) } });
      await tx.queueEvent.create({ data: { entryId: entry.id, actorId: operatorId, eventType: to === 'SERVING' ? 'STARTED' : to, fromStatus: entry.status, toStatus: to, occurredAt: at } });
      return entryDto(updated);
    }, { maxWait: 10000, timeout: 10000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw conflict('SERVICE_SLOT_BUSY', 'Finish the active service before calling next.');
      if (['P2025', 'P2034'].includes(error.code)) throw conflict('CONCURRENT_UPDATE', 'The queue changed. Refresh and try again.');
    }
    throw error;
  }
}

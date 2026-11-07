import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../http/errors.js';
import { formatQueueNumber, joinInput, validId } from './rules.js';
const duplicate = () => new ApiError(409, 'DUPLICATE_ACTIVE_ENTRY', 'You already have an active queue entry.');
const numberConflict = () => new ApiError(409, 'NUMBER_CONFLICT', 'A queue number could not be allocated. Please try again.');
export const queueNotFound = () => new ApiError(404, 'QUEUE_NOT_FOUND', 'Queue not found.');
export async function joinQueue(db: PrismaClient, customerId: string, queueId: unknown, input: unknown) {
  const partySize = joinInput(input);
  if (!validId(queueId)) throw queueNotFound();
  try {
    return await db.$transaction(async tx => {
      // Consistent lock order for every join. The customer lock also serializes
      // same-customer requests aimed at different queues; DB uniqueness remains final.
      const [customer] = await tx.$queryRaw<{ role: string; isActive: boolean }[]>`SELECT role::text AS role, is_active AS "isActive" FROM users WHERE id = ${customerId}::uuid FOR UPDATE`;
      if (!customer?.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
      if (customer.role !== 'CUSTOMER') throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM queues WHERE id = ${queueId}::uuid FOR UPDATE`;
      if (!rows.length) throw queueNotFound();
      const queue = await tx.queue.findUniqueOrThrow({ where: { id: queueId } });
      if (queue.state !== 'OPEN') throw new ApiError(409, 'QUEUE_NOT_OPEN', 'This queue is not open.');
      if (await tx.queueEntry.findFirst({ where: { customerId, status: { in: ['WAITING', 'CALLED', 'SERVING'] } }, select: { id: true } })) throw duplicate();
      const sequence = queue.lastSequence + 1n;
      // The API uses a numeric sequence. Never silently round a BIGINT in JSON.
      if (sequence > BigInt(Number.MAX_SAFE_INTEGER)) throw numberConflict();
      await tx.queue.update({ where: { id: queueId }, data: { lastSequence: sequence } });
      const entry = await tx.queueEntry.create({ data: { queueId, customerId, sequence, displayNumber: formatQueueNumber(queue.code, sequence), partySize, status: 'WAITING' } });
      await tx.queueEvent.create({ data: { entryId: entry.id, actorId: customerId, eventType: 'JOINED', fromStatus: null, toStatus: 'WAITING' } });
      return { id: entry.id, queueId: entry.queueId, displayNumber: entry.displayNumber, sequence: Number(entry.sequence), partySize: entry.partySize, status: entry.status, joinedAt: entry.joinedAt.toISOString() };
    }, { maxWait: 10000, timeout: 10000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = JSON.stringify(error.meta?.target ?? '');
      if (target.includes('customer_id') || target.includes('one_active_customer')) throw duplicate();
      throw numberConflict();
    }
    throw error;
  }
}
const privateSelect = { id: true, displayNumber: true, partySize: true, status: true, joinedAt: true, calledAt: true, servingAt: true, completedAt: true, queue: { select: { code: true } } } satisfies Prisma.QueueEntrySelect;
type PrivateRecord = Prisma.QueueEntryGetPayload<{ select: typeof privateSelect }>;
function privateDto(entry: PrivateRecord) {
  return { id: entry.id, queueCode: entry.queue.code, displayNumber: entry.displayNumber, partySize: entry.partySize, status: entry.status, joinedAt: entry.joinedAt, calledAt: entry.calledAt, servingAt: entry.servingAt, completedAt: entry.completedAt };
}
export async function readCustomerEntry(db: PrismaClient, customerId: string, entryId?: string) {
  const notFound = () => new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
  if (entryId !== undefined && !validId(entryId)) throw notFound();
  const entry = await db.queueEntry.findFirst({ where: { customerId, ...(entryId === undefined ? {} : { id: entryId }) }, orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }], select: privateSelect });
  if (!entry) { if (entryId !== undefined) throw notFound(); return null; }
  return privateDto(entry);
}

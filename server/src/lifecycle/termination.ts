import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../http/errors.js';
import { authorizeOperator, entryDto } from '../operator/service.js';
import { privateDto } from '../queues/service.js';
import { validId } from '../queues/rules.js';

function validateCancellation(body: unknown, operator: boolean): string | undefined {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : undefined;
  const invalid = (field: string, message: string) => new ApiError(422, 'VALIDATION_ERROR', 'Check the submitted fields.', { fields: { [field]: message } });
  if (!input || Object.keys(input).some(key => !operator || key !== 'reason')) {
    throw invalid('form', operator ? 'Only reason is accepted.' : 'Send an empty JSON object.');
  }
  if (!operator) return;
  const original = input.reason;
  const reason = typeof original === 'string' ? original.trim() : '';
  if (!reason || [...reason].length > 200 || typeof original !== 'string' || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(original)) {
    throw invalid('reason', 'Enter a single-line reason of 1–200 characters with no control characters.');
  }
  return reason;
}

export async function cancelEntry(
  db: PrismaClient,
  actor: { id: string; role: 'CUSTOMER' | 'OPERATOR' },
  entryId: unknown,
  body: unknown,
  now: () => Date,
) {
  const missing = () => new ApiError(404, 'ENTRY_NOT_FOUND', 'Queue entry not found.');
  if (!validId(entryId)) throw missing();
  try {
    return await db.$transaction(async tx => {
      const operator = actor.role === 'OPERATOR';
      const where = { id: entryId, ...(!operator && { customerId: actor.id }) };
      if (!operator) {
        const [customer] = await tx.$queryRaw<{ role: string; isActive: boolean }[]>`SELECT role::text AS role, is_active AS "isActive" FROM users WHERE id = ${actor.id}::uuid FOR UPDATE`;
        if (!customer?.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
        if (customer.role !== 'CUSTOMER') throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
      }
      const target = await tx.queueEntry.findFirst({ where, select: { queueId: true } });
      if (!target) throw missing();
      await tx.$queryRaw`SELECT id FROM queues WHERE id = ${target.queueId}::uuid FOR UPDATE`;
      if (operator) await authorizeOperator(tx, actor.id, target.queueId);
      const reason = validateCancellation(body, operator);
      const entry = await tx.queueEntry.findFirst({ where, include: { queue: { select: { code: true } } } });
      if (!entry) throw missing();
      if (entry.status !== 'WAITING') throw new ApiError(409, 'INVALID_TRANSITION', 'This queue entry cannot be moved to that status.');
      const at = now();
      const updated = await tx.queueEntry.update({
        where: { id: entry.id, status: 'WAITING' },
        data: { status: 'CANCELLED', cancelledAt: at },
        include: { queue: { select: { code: true } } },
      });
      await tx.queueEvent.create({ data: { entryId: entry.id, actorId: actor.id, eventType: 'CANCELLED', fromStatus: 'WAITING', toStatus: 'CANCELLED', occurredAt: at, reason } });
      return operator ? { ...entryDto(updated), counterId: null, cancelledAt: updated.cancelledAt, noShowAt: updated.noShowAt } : { ...privateDto(updated), position: null, estimatedWaitMinutes: null };
    }, { maxWait: 10000, timeout: 10000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034'].includes(error.code)) {
      throw new ApiError(409, 'CONCURRENT_UPDATE', 'The queue changed. Refresh and try again.');
    }
    throw error;
  }
}

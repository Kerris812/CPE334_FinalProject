import { ApiError } from '../http/errors.js';
export function validatePartySize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 8) throw new ApiError(422, 'VALIDATION_ERROR', 'Check the submitted fields.', { fields: { partySize: 'Must be an integer from 1 to 8.' } });
  return value;
}
export function joinInput(input: unknown): number {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const partySize = validatePartySize(body.partySize);
  if (Object.keys(body).some(key => key !== 'partySize')) throw new ApiError(422, 'VALIDATION_ERROR', 'Check the submitted fields.', { fields: { form: 'Only partySize is accepted.' } });
  return partySize;
}
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const formatQueueNumber = (code: string, sequence: bigint) => `${code}-${sequence.toString().padStart(4, '0')}`;
export function canTransition(from: string, to: string): boolean {
  return (from === 'WAITING' && to === 'CALLED') || (from === 'CALLED' && to === 'SERVING') || (from === 'SERVING' && to === 'COMPLETED');
}
export function selectNextWaiting<T extends { sequence: bigint; status: string }>(entries: T[]): T | null {
  return entries.reduce<T | null>((head, entry) => entry.status === 'WAITING' && (!head || entry.sequence < head.sequence) ? entry : head, null);
}

export function queueCodeForPartySize(value: unknown): 'R' | 'S' {
  return validatePartySize(value) <= 4 ? 'R' : 'S';
}

/** Queue identity comes from the locked database row, never a browser assertion. */
export function validatePartyQueue(queueCode: string, partySize: number): void {
  if (queueCode !== queueCodeForPartySize(partySize)) throw new ApiError(422, 'VALIDATION_ERROR', 'Check the submitted fields.', { fields: { partySize: 'Parties of 1–4 must join Queue R; parties of 5–8 must join Queue S.' } });
}

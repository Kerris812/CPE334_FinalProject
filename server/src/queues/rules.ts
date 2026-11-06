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

import { expect } from 'vitest';
/** Reject extra keys and object-valued leaves at every level, including null states. */
export function assertPublicBoard(body: unknown) {
  const paths: string[] = [];
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === 'object') {
      expect(Array.isArray(value)).toBe(false);
      for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        paths.push(childPath); visit(child, childPath);
      }
    }
  }
  visit(body, '');
  expect(paths.sort()).toEqual(['data', 'data.calledNumber', 'data.queueCode', 'data.serviceState', 'data.waitingCount'].sort());
  const data = (body as { data: Record<string, unknown> }).data;
  expect(typeof data.queueCode).toBe('string');
  expect(data.calledNumber === null || typeof data.calledNumber === 'string').toBe(true);
  expect([null, 'CALLED', 'SERVING']).toContain(data.serviceState);
  expect(typeof data.waitingCount).toBe('number');
  expect(Number.isInteger(data.waitingCount)).toBe(true);
  expect(Number(data.waitingCount)).toBeGreaterThanOrEqual(0);
}

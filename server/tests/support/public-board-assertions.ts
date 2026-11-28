import { expect } from 'vitest';
export function assertPublicBoard(body: unknown) {
  expect(Object.keys(body as object)).toEqual(['data']);
  const data = (body as { data: Record<string, unknown> }).data;
  expect(Object.keys(data).sort()).toEqual(['activeEntries', 'calledNumber', 'queueCode', 'serviceState', 'waitingCount']);
  expect(typeof data.queueCode).toBe('string');
  expect(data.calledNumber === null || typeof data.calledNumber === 'string').toBe(true);
  expect([null, 'CALLED', 'SERVING']).toContain(data.serviceState);
  expect(typeof data.waitingCount).toBe('number');
  expect(Number.isInteger(data.waitingCount)).toBe(true);
  expect(Number(data.waitingCount)).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(data.activeEntries)).toBe(true);
  const entries = data.activeEntries as Record<string, unknown>[];
  expect(entries.length).toBeLessThanOrEqual(1);
  for (const entry of entries) {
    expect(Object.keys(entry).sort()).toEqual(['counterLabel', 'displayNumber', 'serviceState']);
    expect(typeof entry.displayNumber).toBe('string'); expect(typeof entry.counterLabel).toBe('string');
    expect(['CALLED', 'SERVING']).toContain(entry.serviceState);
    expect(entry.displayNumber).toBe(data.calledNumber); expect(entry.serviceState).toBe(data.serviceState);
  }
  expect(entries.length).toBe(data.calledNumber === null ? 0 : 1);
}
export function legacyBoard(data: Record<string, unknown>) {
  const { activeEntries: _, ...legacy } = data;
  return legacy;
}

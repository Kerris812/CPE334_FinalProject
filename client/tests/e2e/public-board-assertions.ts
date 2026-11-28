import { expect } from '@playwright/test';
export function assertPublicBoard(body: unknown) {
  expect(Object.keys(body as object)).toEqual(['data']);
  const data = (body as { data: Record<string, unknown> }).data;
  expect(Object.keys(data).sort()).toEqual(['activeEntries', 'calledNumber', 'queueCode', 'serviceState', 'waitingCount']);
  const entries = data.activeEntries as Record<string, unknown>[];
  expect(Array.isArray(entries)).toBe(true); expect(entries.length).toBeLessThanOrEqual(1);
  for (const entry of entries) {
    expect(Object.keys(entry).sort()).toEqual(['counterLabel', 'displayNumber', 'serviceState']);
    expect(typeof entry.displayNumber).toBe('string'); expect(typeof entry.counterLabel).toBe('string');
    expect(['CALLED', 'SERVING']).toContain(entry.serviceState);
    expect(entry.displayNumber).toBe(data.calledNumber); expect(entry.serviceState).toBe(data.serviceState);
  }
  expect(entries.length).toBe(data.calledNumber === null ? 0 : 1);
}

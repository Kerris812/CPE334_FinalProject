import { expect, test } from 'vitest';
test('TEST-047 format queue numbers without a four-digit maximum', async () => {
  const { formatQueueNumber } = await import('../../src/queues/rules.js');
  for (const [sequence, expected] of [[1n, 'R-0001'], [9n, 'R-0009'], [9999n, 'R-9999'], [10000n, 'R-10000']] as const) expect(formatQueueNumber('R', sequence)).toBe(expected);
});
test('TEST-048 party size accepts only integers one through eight', async () => {
  const { validatePartySize } = await import('../../src/queues/rules.js');
  for (const value of [1, 8]) expect(validatePartySize(value)).toBe(value);
  for (const value of [0, 9, -1, 1.5, '3', null, undefined, NaN, Infinity, true, {}, []]) expect(() => validatePartySize(value)).toThrow();
});

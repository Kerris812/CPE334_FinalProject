import { expect, test } from 'vitest';
import { queueCodeForPartySize as route } from '../../src/queues/rules.js';
test('TEST-052 party boundaries map to the designated queue', () => { for (const [size, code] of [[1, 'R'], [4, 'R'], [5, 'S'], [8, 'S']]) expect(route(size)).toBe(code); });
test('TEST-052 invalid party sizes cannot be routed', () => { for (const size of [0, 9, -1, 1.5, '5', null, undefined]) expect(() => route(size)).toThrow(expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' })); });

import { expect, test } from 'vitest';
import * as rules from '../../src/queues/rules.js';
test('TEST-045 FIFO selector ignores input ordering and nonwaiting entries', () => { expect(rules.selectNextWaiting([{ sequence: 3n, status: 'WAITING' }, { sequence: 1n, status: 'WAITING' }, { sequence: 2n, status: 'WAITING' }, { sequence: 0n, status: 'COMPLETED' }])?.sequence).toBe(1n); expect(rules.selectNextWaiting([])).toBeNull(); });
test('TEST-046 only SERVING may transition to COMPLETED', () => { for (const from of ['WAITING', 'CALLED', 'SERVING']) expect(rules.canTransition(from, 'COMPLETED')).toBe(from === 'SERVING'); });
test('TEST-049 terminal states have no outgoing transitions', () => { for (const from of ['COMPLETED', 'CANCELLED', 'NO_SHOW']) for (const to of ['WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) expect(rules.canTransition(from, to)).toBe(false); });

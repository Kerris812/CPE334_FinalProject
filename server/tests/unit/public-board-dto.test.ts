import { expect, test } from 'vitest';
import { assertPublicBoard } from '../support/public-board-assertions.js';
test('TEST-031 dedicated public DTO drops nested private properties instead of spreading records', async () => {
  const { publicBoardDto } = await import('../../src/public-board/dto.js');
  const queue = { code: 'R', id: 'private queue', createdAt: 'private time', entries: [{ customer: { email: 'private@example.test' } }] };
  const current = { displayNumber: 'R-10000', status: 'SERVING' as const, id: 'private entry', partySize: 8, customer: { id: 'private customer', displayName: 'Private guest' } };
  const body = { data: publicBoardDto(queue, current, 2) }; assertPublicBoard(body);
  expect(body).toEqual({ data: { queueCode: 'R', calledNumber: 'R-10000', serviceState: 'SERVING', waitingCount: 2 } });
});
test('TEST-029 dedicated public DTO uses null for an empty current slot', async () => {
  const { publicBoardDto } = await import('../../src/public-board/dto.js');
  const body = { data: publicBoardDto({ code: 'R' }, null, 0) }; assertPublicBoard(body);
  expect(body.data).toEqual({ queueCode: 'R', calledNumber: null, serviceState: null, waitingCount: 0 });
});

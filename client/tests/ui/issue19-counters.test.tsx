import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { OperatorDesk } from '../../src/OperatorDesk';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const queue = { id: 'queue-r', code: 'R', name: 'Queue R', state: 'OPEN' };
const head = { id: 'entry-r', displayNumber: 'R-0001', partySize: 4, status: 'WAITING' };
function mock(busy = false, conflict = false) {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      busy = true;
      return conflict ? { ok: false, status: 409, json: async () => ({ error: { code: 'SERVICE_SLOT_BUSY' } }) } : { ok: true, status: 200, json: async () => ({ data: {} }) };
    }
    const active = busy ? { ...head, status: 'CALLED', counterId: 'counter-r' } : null;
    const data = url.endsWith('/queues') ? [queue] : {
      queue, waitingCount: 1, nextWaiting: head, activeEntry: active, activeEntries: active ? [active] : [],
      counter: { id: 'counter-r', code: 'R', name: 'Counter R', queueId: queue.id, status: busy ? 'OCCUPIED' : 'AVAILABLE', occupant: active ? { entryId: active.id, displayNumber: active.displayNumber, status: active.status } : null },
    };
    return { ok: true, status: 200, json: async () => ({ data }) };
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
test('S2-TEST-10/11: desk displays dedicated counter identity and authoritative availability', async () => {
  mock(); render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  await screen.findByText('Counter R'); await screen.findByText('AVAILABLE');
});
test('S2-TEST-10/13: occupied counter disables call even when scalar active entry is stale', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ data: url.endsWith('/queues') ? [queue] : { queue, waitingCount: 1, nextWaiting: head, activeEntry: null, counter: { id: 'counter-r', code: 'R', name: 'Counter R', queueId: queue.id, status: 'OCCUPIED', occupant: { entryId: 'other', displayNumber: 'R-0002', status: 'SERVING' } } } }) })));
  render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  const call = await screen.findByRole('button', { name: 'Call Next' });
  expect((call as HTMLButtonElement).disabled).toBe(true);
});
test('S2-TEST-10/19: call sends displayed counter and FIFO preview then refreshes occupancy', async () => {
  const fetcher = mock(); render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  const call = await screen.findByRole('button', { name: 'Call Next' });
  fireEvent.click(call); fireEvent.click(call);
  await waitFor(() => expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1));
  expect(JSON.parse(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')![1]!.body as string)).toEqual({ counterId: 'counter-r', expectedEntryId: head.id });
  await screen.findByText('OCCUPIED');
});
test('S2-TEST-10/13: conflicting call refreshes authoritative occupancy before retry', async () => {
  const fetcher = mock(false, true); render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Call Next' }));
  await screen.findByText('OCCUPIED');
  expect((screen.getByRole('button', { name: 'Call Next' }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher.mock.calls.filter(([url, options]) => url.endsWith('/desk') && options?.method !== 'POST').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole('alert').textContent).toContain('Finish the active service before calling next.');
});

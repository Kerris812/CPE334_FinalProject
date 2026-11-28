import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CustomerQueues } from '../../src/CustomerQueues';
import { OperatorDesk } from '../../src/OperatorDesk';
import { PublicQueueBoard } from '../../src/PublicQueueBoard';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const queue = { id: 'queue-r', code: 'R', name: 'Queue R', state: 'OPEN' };
const entry = { id: 'entry', queueCode: 'R', displayNumber: 'R-0001', partySize: 4, status: 'CALLED', joinedAt: '2026-11-29T00:00:00.000Z', calledAt: '2026-11-29T00:01:00.000Z' };

for (const view of ['customer', 'operator', 'public'] as const) {
  test(`${view} refresh preserves mounted content while a delayed response is pending`, async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let reads = 0;
    const response = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/operator/queues')) return response([queue]);
      reads++;
      if (reads === 2) await pending;
      return response(view === 'customer' ? entry : view === 'operator' ? { queue, waitingCount: 0, activeEntry: entry, nextWaiting: null } : { queueCode: 'R', calledNumber: entry.displayNumber, serviceState: 'CALLED', waitingCount: 0 });
    }));
    render(view === 'customer' ? <CustomerQueues myQueue onUnauthenticated={vi.fn()} /> : view === 'operator' ? <OperatorDesk onUnauthenticated={vi.fn()} /> : <PublicQueueBoard queueId="R" />);
    const number = await screen.findByText(entry.displayNumber);
    const refresh = screen.getByRole('button', { name: view === 'customer' ? 'Refresh status' : 'Refresh' }) as HTMLButtonElement;
    try {
      fireEvent.click(refresh);
      await waitFor(() => expect(reads).toBe(2));
      expect(refresh.disabled).toBe(true);
      expect(screen.getByText(entry.displayNumber)).toBe(number);
      expect(screen.queryByText(/Loading (queue information|operator desk|public queue status)/)).toBeNull();
      release();
      await waitFor(() => expect(refresh.disabled).toBe(false));
      expect(screen.getByText(entry.displayNumber)).toBe(number);
    } finally { release(); }
  });
}

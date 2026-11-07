import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });
const queue = { id: 'q', code: 'R', name: 'Restaurant', state: 'OPEN' };
function mock(queues = [queue], failure = 0) {
  window.history.replaceState({}, '', '/operator/desk'); let status: string | null = null;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown;
    if (url.endsWith('/auth/me')) data = { user: { id: 'operator', displayName: 'Host', role: 'OPERATOR' } };
    else if (url.endsWith('/operator/queues')) data = queues;
    else if (options?.method === 'POST') { status = status === null ? 'CALLED' : status === 'CALLED' ? 'SERVING' : null; data = {}; }
    else { if (failure) return { ok: false, status: failure, json: async () => ({ error: { code: failure === 403 ? 'QUEUE_ACCESS_DENIED' : 'INTERNAL_ERROR' } }) }; data = { queue, waitingCount: status ? 0 : 1, nextWaiting: null, activeEntry: status ? { id: 'e', displayNumber: 'R-0001', partySize: 4, status } : null }; }
    return { ok: true, status: 200, json: async () => ({ data }) };
  }); vi.stubGlobal('fetch', fetcher); return fetcher;
}
test('operator desk drives valid actions from API state and refreshes', async () => { const fetcher = mock(); render(<App />); await screen.findByLabelText('Assigned queue'); const call = await screen.findByRole('button', { name: 'Call Next' }); await waitFor(() => expect(call.hasAttribute('disabled')).toBe(false)); fireEvent.click(call); fireEvent.click(call); await screen.findByText('R-0001'); expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1); fireEvent.click(screen.getByRole('button', { name: 'Start Service' })); await screen.findByText('SERVING'); fireEvent.click(screen.getByRole('button', { name: 'Complete Service' })); await screen.findByText('Service completed.'); });
test('operator with no assignments sees an empty state', async () => { mock([]); render(<App />); await screen.findByText('No assigned queues.'); });
for (const code of [403, 500]) test(`operator desk handles ${code} safely`, async () => { mock([queue], code); render(<App />); await screen.findByText(code === 403 ? 'You do not have permission to access this queue.' : 'Unable to load the operator desk. Please retry.'); expect(screen.queryByRole('button', { name: 'Call Next' })).toBeNull(); });

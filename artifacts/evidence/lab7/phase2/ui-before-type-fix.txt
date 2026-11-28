import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { OperatorDesk } from '../../src/OperatorDesk';

const queues = [
  { id: 'queue-r', code: 'R', name: 'Small parties', state: 'OPEN' },
  { id: 'queue-s', code: 'S', name: 'Large parties', state: 'OPEN' },
];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function api(initial: 'CALLED' | 'SERVING' | null = null) {
  const states: Record<string, 'CALLED' | 'SERVING' | null> = { 'queue-r': initial, 'queue-s': null };
  let conflict = false;
  let failure = 0;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (failure) return { ok: false, status: failure, json: async () => ({ error: { code: failure === 401 ? 'UNAUTHENTICATED' : 'QUEUE_ACCESS_DENIED' } }) };
    if (url.endsWith('/operator/queues')) return { ok: true, status: 200, json: async () => ({ data: queues }) };
    const queue = queues.find(q => url.includes(q.id))!;
    if (options?.method === 'POST') {
      if (conflict) {
        states[queue.id] = 'SERVING';
        conflict = false;
        return { ok: false, status: 409, json: async () => ({ error: { code: 'INVALID_TRANSITION' } }) };
      }
      states[queue.id] = url.endsWith('call-next') ? 'CALLED' : url.endsWith('start-service') ? 'SERVING' : null;
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    }
    const status = states[queue.id];
    const activeEntry = status ? { id: `${queue.id}-entry`, displayNumber: `${queue.code}-0001`, partySize: queue.code === 'R' ? 4 : 5, status } : null;
    return { ok: true, status: 200, json: async () => ({ data: { queue, waitingCount: status ? 0 : 1, nextWaiting: null, activeEntry } }) };
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, states, conflict: () => { conflict = true; }, fail: (status: number) => { failure = status; } };
}
async function enabled(name: string) {
  const button = await screen.findByRole('button', { name, exact: true });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  return button;
}

test('L7-001 L7-002 the desk renders a supplied shared assignment list and selects the correct queue', async () => {
  const { fetcher } = api();
  render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  const selector = await screen.findByLabelText('Assigned queue');
  expect([...selector.querySelectorAll('option')].map(o => o.value)).toEqual(['queue-r', 'queue-s']);
  await screen.findByText('Restaurant Queue R');
  fireEvent.change(selector, { target: { value: 'queue-s' } });
  await screen.findByText('Restaurant Queue S');
  fireEvent.click(await enabled('Call Next'));
  await screen.findByText('S-0001');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST').map(([url]) => url)).toEqual(['/api/v1/operator/queues/queue-s/call-next']);
  fireEvent.click(await enabled('Start Service'));
  await screen.findByText('SERVING');
  fireEvent.click(await enabled('Complete Service'));
  await screen.findByText('Service completed.');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST').map(([url]) => url)).toEqual([
    '/api/v1/operator/queues/queue-s/call-next', '/api/v1/operator/entries/queue-s-entry/start-service', '/api/v1/operator/entries/queue-s-entry/complete',
  ]);
});
test('L7-019 stale operator start refreshes after another operator has already started', async () => {
  const backend = api('CALLED');
  render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  const button = await enabled('Start Service');
  backend.conflict();
  fireEvent.click(button);
  await screen.findByText('This action is no longer valid. The desk has been refreshed.');
  await screen.findByText('SERVING');
  await enabled('Complete Service');
  expect(screen.getByRole('button', { name: 'Start Service' }).hasAttribute('disabled')).toBe(true);
  expect(backend.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});
for (const status of [401, 403]) {
  test(`L7-016 shared desk preserves safe ${status} handling`, async () => {
    const backend = api();
    const onUnauthenticated = vi.fn();
    backend.fail(status);
    render(<OperatorDesk onUnauthenticated={onUnauthenticated} />);
    if (status === 401) await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled());
    else await screen.findByText('You do not have permission to access this queue.');
    expect(screen.queryByRole('button', { name: 'Call Next' })).toBeNull();
  });
}

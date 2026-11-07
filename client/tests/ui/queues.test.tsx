import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
const queue = { id: 'queue-id', code: 'R', name: 'Restaurant Waiting Queue', state: 'OPEN' };
const entry = { id: 'entry-id', queueCode: 'R', displayNumber: 'R-10000', partySize: 4, status: 'WAITING', joinedAt: '2026-11-06T10:00:00.000Z', calledAt: null, servingAt: null, completedAt: null };
const response = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
let mock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.history.replaceState({}, '', '/queues');
  mock = vi.fn(async (path: string) => path.endsWith('/auth/me') ? response(200, { data: { user: { id: 'customer-id', displayName: 'Customer A', role: 'CUSTOMER' } } }) : path.endsWith('/entries/latest') ? response(200, { data: null }) : response(200, { data: [queue] }));
  vi.stubGlobal('fetch', mock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function form() { render(<App />); return screen.findByLabelText('Party size'); }
test('queue form displays server metadata and associated party-size validation', async () => {
  await form(); expect(screen.getByText(queue.name)).toBeTruthy();
  for (const value of ['0', '9', '-1', '1.5', '']) { fireEvent.change(screen.getByLabelText('Party size'), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Join queue' })); expect(screen.getByLabelText('Party size').getAttribute('aria-invalid')).toBe('true'); }
  expect(mock.mock.calls.some(call => String(call[0]).endsWith('/entries'))).toBe(false);
});
test('pending join disables double submission and displays authoritative number with my-queue link', async () => {
  await form(); let resolve!: (value: unknown) => void;
  mock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  fireEvent.submit(screen.getByRole('button', { name: 'Join queue' }).closest('form')!); fireEvent.submit(screen.getByRole('button', { name: 'Joining…' }).closest('form')!);
  expect((screen.getByLabelText('Party size') as HTMLInputElement).disabled).toBe(true); expect(mock.mock.calls.filter(call => String(call[0]).endsWith('/entries'))).toHaveLength(1);
  resolve(response(201, { data: entry })); await screen.findByText('R-10000'); expect(screen.getByText('WAITING')).toBeTruthy(); expect(screen.getByRole('link', { name: 'View my queue' }).getAttribute('href')).toBe('/my-queue'); expect(screen.queryByRole('button', { name: 'Join queue' })).toBeNull();
});
test('duplicate conflict refreshes own latest entry and shows actionable message', async () => {
  await form(); mock.mockResolvedValueOnce(response(409, { error: { code: 'DUPLICATE_ACTIVE_ENTRY' } })); mock.mockResolvedValueOnce(response(200, { data: entry }));
  fireEvent.click(screen.getByRole('button', { name: 'Join queue' })); await screen.findByText('You already have an active queue entry.'); await screen.findByText('R-10000');
});
test('queue discovery recovers from connection errors and supports empty state', async () => {
  mock.mockResolvedValueOnce(response(200, { data: { user: { id: 'customer-id', displayName: 'Customer A', role: 'CUSTOMER' } } })); mock.mockRejectedValueOnce(new Error('offline'));
  render(<App />); await screen.findByRole('button', { name: 'Retry' });
  mock.mockImplementation(async (path: string) => path.endsWith('/entries/latest') ? response(200, { data: null }) : response(200, { data: [] }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByText('No open queues are available.');
});
test('my-queue reload reads saved entry and completed entries allow a new join', async () => {
  window.history.replaceState({}, '', '/my-queue');
  mock.mockImplementation(async (path: string) => path.endsWith('/auth/me') ? response(200, { data: { user: { id: 'customer-id', displayName: 'Customer A', role: 'CUSTOMER' } } }) : response(200, { data: entry }));
  render(<App />); await screen.findByText('R-10000'); expect(screen.getByRole('link', { name: 'Back to queues' }).getAttribute('href')).toBe('/queues');
  cleanup(); window.history.replaceState({}, '', '/queues');
  mock.mockImplementation(async (path: string) => path.endsWith('/auth/me') ? response(200, { data: { user: { id: 'customer-id', displayName: 'Customer A', role: 'CUSTOMER' } } }) : path.endsWith('/entries/latest') ? response(200, { data: { ...entry, status: 'COMPLETED' } }) : response(200, { data: [queue] }));
  render(<App />); await screen.findByRole('button', { name: 'Join queue' });
});
test('join handles server field validation, unavailable queues and expired identity', async () => {
  await form(); mock.mockResolvedValueOnce(response(422, { error: { code: 'VALIDATION_ERROR', details: { fields: { partySize: 'Must be an integer from 1 to 8.' } } } }));
  fireEvent.click(screen.getByRole('button', { name: 'Join queue' })); await screen.findByText('Must be an integer from 1 to 8.');
  mock.mockResolvedValueOnce(response(409, { error: { code: 'QUEUE_NOT_OPEN' } })); fireEvent.click(screen.getByRole('button', { name: 'Join queue' })); await screen.findByText('This queue is no longer open. Please refresh or try again later.'); await screen.findByLabelText('Party size');
  mock.mockResolvedValueOnce(response(401, { error: { code: 'UNAUTHENTICATED' } })); fireEvent.click(screen.getByRole('button', { name: 'Join queue' })); await waitFor(() => expect(window.location.pathname).toBe('/login'));
});
test('public board stays anonymous and displays only public number, state and count', async () => {
  window.history.replaceState({}, '', '/board/queue-id');
  mock.mockImplementation(async (path: string) => path.includes('/public/') ? response(200, { data: { queueCode: 'R', calledNumber: 'R-0007', serviceState: 'CALLED', waitingCount: 3 } }) : response(401, {}));
  render(<App />); await screen.findByText('R-0007'); expect(screen.getByText('CALLED')).toBeTruthy(); expect(screen.getByText('3')).toBeTruthy(); expect(screen.queryByLabelText('Password')).toBeNull();
});
test('public board distinguishes loading, empty, missing and retryable errors', async () => {
  window.history.replaceState({}, '', '/board/queue-id');
  mock.mockImplementation(async (path: string) => path.includes('/public/') ? response(404, { error: { code: 'QUEUE_NOT_FOUND' } }) : response(401, {}));
  render(<App />); await screen.findByText("This queue isn't available"); cleanup();
  mock.mockImplementation(async (path: string) => path.includes('/public/') ? response(500, {}) : response(401, {}));
  render(<App />); await screen.findByRole('button', { name: 'Retry' });
  mock.mockImplementation(async () => response(200, { data: { queueCode: 'R', calledNumber: null, serviceState: null, waitingCount: 0 } })); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await screen.findByText('No one is being called yet');
});

test('my-queue polls while visible and stops polling after unmount', async () => {
  window.history.replaceState({}, '', '/my-queue');
  let status = 'WAITING';
  mock.mockImplementation(async (path: string) => path.endsWith('/auth/me') ? response(200, { data: { user: { id: 'customer-id', displayName: 'Customer A', role: 'CUSTOMER' } } }) : response(200, { data: { ...entry, status } }));
  vi.useFakeTimers();
  await act(async () => { render(<App />); });
  expect(screen.getByText('WAITING')).toBeTruthy();
  const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  status = 'CALLED'; await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); expect(screen.getByText('CALLED')).toBeTruthy();
  visible.mockReturnValue('hidden'); const calls = mock.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(mock.mock.calls.length).toBe(calls);
  cleanup(); expect(vi.getTimerCount()).toBe(0);
});

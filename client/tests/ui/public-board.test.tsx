import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PublicQueueBoard, PublicQueueDisplay } from '../../src/PublicQueueBoard';
const board = { queueCode: 'R', calledNumber: 'R-10000', serviceState: 'CALLED', waitingCount: 2 };
const response = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
let mock: ReturnType<typeof vi.fn>;
let visibility: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mock = vi.fn().mockResolvedValue(response(200, { data: board })); vi.stubGlobal('fetch', mock);
  visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => { render(<PublicQueueBoard queueId="queue-id" />); }); }
test('TEST-028 anonymous board labels all four public values without showing extra private response data', async () => {
  mock.mockResolvedValueOnce(response(200, { data: { ...board, customer: { displayName: 'Private guest', email: 'private@example.test' }, partySize: 7 } }));
  await mount();
  expect(screen.getByText('Queue R')).toBeTruthy(); expect(screen.getByText('R-10000')).toBeTruthy(); expect(screen.getByText('CALLED')).toBeTruthy();
  expect(screen.getByLabelText('Waiting guests').textContent).toBe('2');
  for (const text of ['Private guest', 'private@example.test', 'Party size: 7']) expect(screen.queryByText(text)).toBeNull();
  expect(screen.queryByRole('button', { name: /sign in|log out/i })).toBeNull(); expect(screen.queryByLabelText('Password')).toBeNull();
  expect(mock.mock.calls[0][0]).toBe('/api/v1/public/queues/queue-id/board');
});
test('TEST-029 visible polling updates number, service state and waiting count then clears completed slot', async () => {
  vi.useFakeTimers(); await mount();
  expect(screen.getByText('CALLED')).toBeTruthy();
  mock.mockResolvedValueOnce(response(200, { data: { ...board, serviceState: 'SERVING', waitingCount: 1 } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.getByText('SERVING')).toBeTruthy(); expect(screen.getByLabelText('Waiting guests').textContent).toBe('1');
  mock.mockResolvedValueOnce(response(200, { data: { ...board, calledNumber: null, serviceState: null, waitingCount: 0 } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.getByText('No one is being called yet')).toBeTruthy(); expect(screen.queryByText('SERVING')).toBeNull(); expect(screen.getByLabelText('Waiting guests').textContent).toBe('0');
});
test('board handles slow loading, network failure, safe retry and unknown queue states', async () => {
  let resolve!: (value: unknown) => void;
  mock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<PublicQueueBoard queueId="queue-id" />); expect(screen.getByRole('status').textContent).toBe('Loading public queue status…');
  await act(async () => { resolve(response(503, { error: { message: 'Private SQL diagnostic' } })); });
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy(); expect(screen.queryByText('Private SQL diagnostic')).toBeNull();
  mock.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); }); expect(screen.getByRole('alert')).toBeTruthy();
  mock.mockResolvedValueOnce(response(404, { error: { code: 'QUEUE_NOT_FOUND' } }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  expect(screen.getByText("This queue isn't available")).toBeTruthy(); expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('Private SQL diagnostic')).toBeNull();
});
test('hidden board stops timers, resumes immediately and cleans up on unmount', async () => {
  vi.useFakeTimers(); await mount(); expect(vi.getTimerCount()).toBe(1);
  visibility.mockReturnValue('hidden'); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); expect(vi.getTimerCount()).toBe(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); expect(mock).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible'); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); expect(mock).toHaveBeenCalledTimes(2);
  cleanup(); expect(vi.getTimerCount()).toBe(0);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(20000); }); expect(mock).toHaveBeenCalledTimes(2);
});
test('slow board poll never overlaps visibility refresh or retry and late responses do not render', async () => {
  vi.useFakeTimers(); await mount(); let resolve!: (value: unknown) => void;
  mock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); document.dispatchEvent(new Event('visibilitychange')); }); expect(mock).toHaveBeenCalledTimes(2);
  cleanup(); await act(async () => { resolve(response(200, { data: board })); }); expect(screen.queryByText('R-10000')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

test('empty state has helper copy, local update time and a secondary refresh action', async () => {
  mock.mockResolvedValue(response(200, { data: { ...board, calledNumber: null, serviceState: null } }));
  await mount();
  expect(screen.getByRole('heading', { name: 'No one is being called yet' })).toBeTruthy();
  expect(screen.getByText('The next called number will appear here.')).toBeTruthy();
  expect(document.querySelector('.public-called-number')).toBeNull();
  expect(document.querySelector('time')?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  expect(screen.getByText(/refreshes every 10 s/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Refresh' }).className).toContain('ui-button');
});

test('navigation retains approved R/S queues during errors, marks selection and excludes private metadata', async () => {
  mock.mockImplementation(async (path: string) => path.includes('/S/') ? response(404, { error: { message: 'Secret database details' } }) : response(200, { data: { ...board, name: 'Private restaurant name', customer: { email: 'private@example.test' } } }));
  await act(async () => { render(<PublicQueueDisplay queueId="R" />); });
  expect(screen.getByRole('link', { name: 'Queue R' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Queue S' }).getAttribute('href')).toBe('/board/S');
  expect(screen.getByRole('link', { name: 'Both queues' }).getAttribute('aria-current')).toBeNull();
  for (const privateValue of ['Private restaurant name', 'private@example.test', 'Secret database details']) expect(screen.queryByText(privateValue)).toBeNull();
  expect(mock.mock.calls.every(([path]) => String(path).startsWith('/api/v1/public/queues/'))).toBe(true);
  mock.mockResolvedValue(response(404, { error: { code: 'QUEUE_NOT_FOUND' } }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); });
  expect(screen.getByRole('link', { name: 'Queue R' }).getAttribute('href')).toBe('/board/R');
  expect(screen.getByRole('heading', { name: "This queue isn't available" })).toBeTruthy();
});

test('Queue S keeps its heading, badge and selected navigation when its API returns 404', async () => {
  mock.mockResolvedValue(response(404, { error: { code: 'QUEUE_NOT_FOUND' } }));
  await act(async () => { render(<PublicQueueDisplay queueId="S" />); });
  expect(screen.getByRole('heading', { name: 'Queue S' })).toBeTruthy();
  expect(document.querySelector('.ui-card-badge')?.textContent).toBe('S');
  expect(screen.getByRole('link', { name: 'Queue S' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('heading', { name: "This queue isn't available" })).toBeTruthy();
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CustomerQueues } from '../../src/CustomerQueues';
const entry = { id: 'entry', queueCode: 'R', displayNumber: 'R-10000', partySize: 4, status: 'WAITING', joinedAt: '2026-11-06T10:00:00.000Z', calledAt: null, servingAt: null, completedAt: null };
const response = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
let mock: ReturnType<typeof vi.fn>;
let visible: ReturnType<typeof vi.spyOn>;
const unauthorized = vi.fn();
beforeEach(() => {
  unauthorized.mockReset();
  mock = vi.fn().mockResolvedValue(response(200, { data: entry }));
  vi.stubGlobal('fetch', mock);
  visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => { render(<CustomerQueues myQueue onUnauthenticated={unauthorized} />); }); }

test('TEST-030 customer status loading, empty and all four lifecycle states use server values', async () => {
  let finish!: (value: unknown) => void;
  mock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<CustomerQueues myQueue onUnauthenticated={unauthorized} />);
  expect(screen.getByText('Loading queue information…')).toBeTruthy();
  await act(async () => { finish(response(200, { data: null })); });
  expect(screen.getByText('You have no queue entry.')).toBeTruthy();
  for (const status of ['WAITING', 'CALLED', 'SERVING', 'COMPLETED']) {
    mock.mockResolvedValueOnce(response(200, { data: { ...entry, status } }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })); });
    expect(screen.getByText('R-10000')).toBeTruthy();
    expect(screen.getByText(status).classList.contains(`status-${status.toLowerCase()}`)).toBe(true);
    expect(screen.getByText('Party size: 4')).toBeTruthy();
  }
});

test('TEST-030 a missing private entry shows a safe not-found state and can retry', async () => {
  mock.mockResolvedValueOnce(response(404, { error: { code: 'ENTRY_NOT_FOUND', message: 'untrusted private diagnostic' } }));
  await mount();
  expect(screen.getByText('Queue entry not found.')).toBeTruthy();
  expect(screen.queryByText('untrusted private diagnostic')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  expect(screen.getByText('R-10000')).toBeTruthy();
});

test('TEST-030 network/backend errors are retryable and expired identity invokes login redirect', async () => {
  mock.mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(screen.getByRole('alert')).toBeTruthy();
  mock.mockResolvedValueOnce(response(503, {}));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  mock.mockResolvedValueOnce(response(401, { error: { code: 'UNAUTHENTICATED' } }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  expect(unauthorized).toHaveBeenCalled();
});

test('TEST-030 manual refresh cannot overlap an in-flight automatic poll', async () => {
  vi.useFakeTimers(); await mount();
  let finish!: (value: unknown) => void;
  mock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(mock).toHaveBeenCalledTimes(2);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(mock).toHaveBeenCalledTimes(2);
  await act(async () => { finish(response(200, { data: { ...entry, status: 'SERVING' } })); });
  expect(screen.getByText('SERVING')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })); });
  expect(mock).toHaveBeenCalledTimes(3);
});

test('TEST-030 hides stop the polling timer, visibility resumes one refresh, and unmount cleans up', async () => {
  vi.useFakeTimers(); await mount();
  expect(vi.getTimerCount()).toBe(1);
  visible.mockReturnValue('hidden');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(mock).toHaveBeenCalledTimes(1);
  visible.mockReturnValue('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(mock).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(1);
  cleanup(); expect(vi.getTimerCount()).toBe(0);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(20000); });
  expect(mock).toHaveBeenCalledTimes(2);
});

test('TEST-030 pending initial request, visibility changes and late unmounted responses never overlap', async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  mock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); document.dispatchEvent(new Event('visibilitychange')); });
  expect(mock).toHaveBeenCalledTimes(1);
  cleanup();
  await act(async () => { finish(response(200, { data: entry })); await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.queryByText('R-10000')).toBeNull();
  expect(mock).toHaveBeenCalledTimes(1);
});

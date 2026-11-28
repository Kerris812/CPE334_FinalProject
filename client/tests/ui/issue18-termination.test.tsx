import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CustomerQueues } from '../../src/CustomerQueues';
import { OperatorDesk } from '../../src/OperatorDesk';

const entry = { id: 'entry', queueCode: 'R', displayNumber: 'R-0001', partySize: 4, status: 'WAITING', joinedAt: '2026-11-06T10:00:00.000Z' };
const queue = { id: 'queue', code: 'R', name: 'Queue R', state: 'OPEN' };
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.unstubAllGlobals(); });

test('S2-TEST-26: customer confirms cancellation and sees refreshed terminal status', async () => {
  let current = entry;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') current = { ...entry, status: 'CANCELLED' };
    return response(current);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<CustomerQueues myQueue onUnauthenticated={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel Queue' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/lose your current position/i)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }));
  await screen.findByText('CANCELLED');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
    ['/api/v1/customer/entries/entry/cancel', expect.objectContaining({ body: '{}' })],
  ]);
});

test('S2-TEST-26: operator validates the reason and uses the waiting entry ID', async () => {
  let waiting: typeof entry | null = entry;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') { waiting = null; return response({ ...entry, status: 'CANCELLED' }); }
    return response(url.endsWith('/queues') ? [queue] : { queue, waitingCount: waiting ? 1 : 0, nextWaiting: waiting, activeEntry: null });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel waiting entry' }));
  const dialog = screen.getByRole('dialog');
  const confirm = within(dialog).getByRole('button', { name: 'Confirm cancellation' });
  fireEvent.click(confirm);
  expect(within(dialog).getByText(/enter a single-line reason/i)).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('Cancellation reason'), { target: { value: 'Requested by guest' } });
  fireEvent.click(confirm);
  await screen.findByText('No waiting customers.');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
    ['/api/v1/operator/entries/entry/cancel', expect.objectContaining({ body: '{"reason":"Requested by guest"}' })],
  ]);
});

test('S2-TEST-26: no-show remains manual and requires confirmation after eligibility', async () => {
  let active = { ...entry, status: 'CALLED', calledAt: new Date(Date.now() - 301000).toISOString() };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') { active = { ...active, status: 'NO_SHOW' }; return response(active); }
    return response(url.endsWith('/queues') ? [queue] : { queue, waitingCount: 0, nextWaiting: null, activeEntry: active.status === 'CALLED' ? active : null });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<OperatorDesk onUnauthenticated={vi.fn()} />);
  const button = await screen.findByRole('button', { name: 'Mark no-show' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  fireEvent.click(button);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm no-show' }));
  await screen.findByText('No active service.');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toEqual([
    ['/api/v1/operator/entries/entry/no-show', expect.objectContaining({ body: '{}' })],
  ]);
});

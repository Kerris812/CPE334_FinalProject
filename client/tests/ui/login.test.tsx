import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
const user = { id: 'customer-id', displayName: 'Customer A', role: 'CUSTOMER' };
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.history.replaceState({}, '', '/login');
  fetchMock = vi.fn().mockResolvedValue(response(401));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function form() { render(<App />); return screen.findByLabelText('Email'); }
function fill() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'customer.a@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic test password' } });
}
test('login has accessible fields, password toggle, no role selector and associated validation', async () => {
  await form();
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toBeTruthy();
  expect(fetchMock.mock.calls.length).toBe(1);
});
test('login submits once, announces loading, and redirects customer from trusted response', async () => {
  await form(); fill();
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
  fireEvent.submit(screen.getByRole('button', { name: 'Signing in…' }).closest('form')!);
  expect((screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(true);
  expect(fetchMock.mock.calls.length).toBe(2);
  resolve(response(200, { data: { user } }));
  await screen.findByText('Customer A');
  expect(window.location.pathname).toBe('/queues');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'customer.a@example.test', password: 'synthetic test password' });
});
test('restores operator identity via me on reload and logs out to login', async () => {
  fetchMock.mockResolvedValueOnce(response(200, { data: { user: { ...user, role: 'OPERATOR' } } }));
  render(<App />);
  await screen.findByText('Customer A');
  expect(window.location.pathname).toBe('/operator/desk');
  fetchMock.mockResolvedValueOnce(response(204));
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.location.pathname).toBe('/login');
  expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/logout');
});
test('shows generic credentials errors and server field validation with safe retry', async () => {
  await form(); fill();
  fetchMock.mockResolvedValueOnce(response(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Invalid email or password.');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'another synthetic password' } });
  fetchMock.mockResolvedValueOnce(response(422, { error: { details: { fields: { email: 'Enter a valid email.' } } } }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Enter a valid email.');
  expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
});
test('connection failures during identity restore are retryable and do not show private content', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  render(<App />);
  await screen.findByRole('button', { name: 'Retry' });
  expect(screen.queryByText('Customer A')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('button', { name: 'Sign in' });
});
test('failed logout keeps identity with retry; unauthenticated logout clears identity', async () => {
  fetchMock.mockResolvedValueOnce(response(200, { data: { user } }));
  render(<App />); await screen.findByText('Customer A');
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await screen.findByRole('alert');
  expect(screen.getByText('Customer A')).toBeTruthy();
  fetchMock.mockResolvedValueOnce(response(401));
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(window.location.pathname).toBe('/login'));
});

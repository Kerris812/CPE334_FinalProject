import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });
function identity(role: 'CUSTOMER' | 'OPERATOR') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { user: { id: 'test', displayName: 'Account', role } } }) }));
}
test('operator cannot access the customer private queue page', async () => {
  window.history.replaceState({}, '', '/my-queue'); identity('OPERATOR'); render(<App />);
  await screen.findByRole('heading', { name: 'Access denied' });
  expect(screen.queryByText(/Service controls will/)).toBeNull();
});
test('customer cannot access operator routes by a direct URL', async () => {
  window.history.replaceState({}, '', '/operator/desk'); identity('CUSTOMER'); render(<App />);
  await screen.findByRole('heading', { name: 'Access denied' });
});
test('anonymous public board stays public without inventing a display role', async () => {
  window.history.replaceState({}, '', '/board/test-queue');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  render(<App />);
  await screen.findByRole('heading', { name: 'Public queue display' });
  expect(window.location.pathname).toBe('/board/test-queue');
  expect(screen.queryByLabelText('Password')).toBeNull();
});

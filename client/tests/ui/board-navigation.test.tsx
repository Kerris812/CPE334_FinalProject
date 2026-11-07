import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App';
function mount(role: 'CUSTOMER' | 'OPERATOR' | null = null, referrer = '', length = 1, state: unknown = {}) {
  window.history.replaceState(state, '', '/board');
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
  vi.spyOn(window.history, 'length', 'get').mockReturnValue(length);
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    const data = path.endsWith('/auth/me') ? { user: role ? { id: 'u', displayName: 'Account', role } : null } : path.includes('/public/') ? { queueCode: path.includes('/S/') ? 'S' : 'R', calledNumber: null, serviceState: null, waitingCount: 0 } : path.endsWith('/entries/latest') ? null : [];
    return { ok: true, status: 200, json: async () => ({ data }) };
  })); render(<App />);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });
async function back() { const button = await screen.findByRole('button', { name: 'Back' }); await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button); }
for (const [role, target] of [['CUSTOMER', '/my-queue'], ['OPERATOR', '/operator/desk'], [null, '/login']] as const) {
  test(`direct board entry falls back safely for ${role ?? 'anonymous'}`, async () => { mount(role); await back(); await waitFor(() => expect(window.location.pathname).toBe(target)); });
}
test('Back returns to the safe same-origin source page', async () => { mount('CUSTOMER', `${window.location.origin}/queues`, 2); await back(); expect(window.location.pathname).toBe('/queues'); });
test('recorded in-app navigation takes precedence over an external referrer', async () => { mount('CUSTOMER', 'https://outside.example/', 2, { publicBoardPrevious: '/my-queue' }); await back(); expect(window.location.pathname).toBe('/my-queue'); });
for (const source of ['https://outside.example/queues', '//outside.example/queues', 'javascript:alert(1)', '/api/v1/auth/logout', '/unknown']) {
  test(`unsafe source ${source} uses the role fallback`, async () => { mount('OPERATOR', source, 2, { publicBoardPrevious: source }); await back(); expect(window.location.pathname).toBe('/operator/desk'); });
}
test('same-origin referrer without usable history uses the role fallback', async () => { mount('CUSTOMER', `${window.location.origin}/queues`, 1); await back(); expect(window.location.pathname).toBe('/my-queue'); });
test('Back is a focusable native button with a decorative left arrow', async () => { mount(); const button = await screen.findByRole('button', { name: 'Back' }); expect(button.tagName).toBe('BUTTON'); button.focus(); expect(document.activeElement).toBe(button); expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull(); });
test('opening the board inside the app records the source and Back restores it', async () => { mount('CUSTOMER'); await back(); await screen.findByRole('heading', { name: 'My queue' }); fireEvent.click(screen.getByRole('link', { name: 'View public board' })); await screen.findByRole('heading', { name: 'Public queue display' }); expect(window.history.state.publicBoardPrevious).toBe('/my-queue'); await back(); expect(window.location.pathname).toBe('/my-queue'); });

test('authenticated landing referrer resolves to the role home rather than a missing page', async () => { mount('CUSTOMER', `${window.location.origin}/`, 2); await back(); expect(window.location.pathname).toBe('/my-queue'); });

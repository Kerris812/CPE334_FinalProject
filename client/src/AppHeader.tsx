import type { ReactNode } from 'react';
import type { User } from './auth-api';
import { Button } from './components/ui';
export function AppHeader({ user, loggingOut, onLogout, statusPage = false, publicPage = false }: { user?: User | null; loggingOut: boolean; onLogout: () => void; statusPage?: boolean; publicPage?: boolean }) {
  const initials = user?.displayName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase() || '?';
  const wordmark: ReactNode = statusPage ? <span className="customer-wordmark app-wordmark">Restaurant Queue</span> : <h1 className="app-wordmark">Restaurant Queue</h1>;
  return <header className="app-header"><div className="app-header-inner"><div className="app-brand"><svg className="app-logo" aria-hidden="true" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m24 2 19 11v22L24 46 5 35V13Z"/><path d="M15 13v9c0 5 8 5 8 0v-9m-4 0v23m14-23c-5 5-7 10-7 15h7m0-15v23"/></svg>{wordmark}</div>
    {!publicPage && user && <div className={`header-account ${statusPage ? 'customer-user-chip' : 'account-identity'}`}><span className="customer-initials" aria-hidden="true">{initials}</span><div className="customer-user-details"><strong>{user.displayName}</strong><span className="customer-user-role">{user.role}</span></div><Button variant="ghost" className="header-logout" onClick={onLogout} disabled={loggingOut} pending={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</Button></div>}
  </div></header>;
}

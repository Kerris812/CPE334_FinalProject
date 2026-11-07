import { isPublicBoard, type User } from './auth-api';

/** Resolve an application route, never blindly traverse unknown browser history. */
export function boardBackPath(user: User | null): string {
  const fallback = user?.role === 'OPERATOR' ? '/operator/desk' : user?.role === 'CUSTOMER' ? '/my-queue' : '/login';
  if (window.history.length <= 1) return fallback;
  const state: unknown = window.history.state;
  const previous = state && typeof state === 'object' && 'publicBoardPrevious' in state ? state.publicBoardPrevious : undefined;
  for (const source of [previous, document.referrer]) {
    if (typeof source !== 'string' || !source) continue;
    try {
      const url = new URL(source, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) continue;
      const path = url.pathname;
      if (path === '/' || path === '/login') return fallback;
      if (isPublicBoard(path)
        || (user?.role === 'CUSTOMER' && ['/queues', '/my-queue'].includes(path))
        || (user?.role === 'OPERATOR' && path === '/operator/desk')) return path;
    } catch { /* Invalid URLs have no safe navigation target. */ }
  }
  return fallback;
}

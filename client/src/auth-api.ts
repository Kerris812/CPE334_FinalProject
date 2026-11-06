export interface User {
  id: string;
  displayName: string;
  role: 'CUSTOMER' | 'OPERATOR';
}
export class AuthError extends Error {
  constructor(public status: number, public fields: Record<string, string> = {}) {
    super(status === 401 ? 'Invalid email or password.' : 'Unable to connect. Please try again.');
  }
}
export async function authRequest(path: string, body?: { email: string; password: string } | Record<string, never>): Promise<User | null> {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new AuthError(response.status, payload?.error?.details?.fields ?? {});
  }
  if (response.status === 204) return null;
  return (await response.json()).data.user;
}
export const home = (user: User) => user.role === 'CUSTOMER' ? '/queues' : '/operator/desk';

export const isUnauthenticated = (error: unknown) => error instanceof AuthError && error.status === 401;

/** Navigation follows the server-authenticated identity; backend guards remain authoritative. */
export const isPublicBoard = (path: string) => /^\/board\/[^/]+\/?$/.test(path);
export function routeAccess(user: User, path: string): 'allowed' | 'forbidden' | 'missing' {
  if (isPublicBoard(path)) return 'allowed';
  if (path === '/queues' || path === '/my-queue') return user.role === 'CUSTOMER' ? 'allowed' : 'forbidden';
  if (path === '/operator' || path.startsWith('/operator/')) return user.role === 'OPERATOR' ? 'allowed' : 'forbidden';
  return 'missing';
}

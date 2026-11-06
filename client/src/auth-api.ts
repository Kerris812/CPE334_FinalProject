import { HttpError, requestData } from './api-client';
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
  try { return (await requestData<{ user: User }>(`/auth/${path}`, body))?.user ?? null; }
  catch (error) { if (error instanceof HttpError) throw new AuthError(error.status, error.fields); throw error; }
}

export const home = (user: User) => user.role === 'CUSTOMER' ? '/queues' : '/operator/desk';

export const isUnauthenticated = (error: unknown) => error instanceof AuthError && error.status === 401;

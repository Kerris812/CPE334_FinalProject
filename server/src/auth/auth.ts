import { createHash, randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import type { PrismaClient, User } from '@prisma/client';
import type { CookieOptions, RequestHandler } from 'express';
import { Router, json } from 'express';
import { ApiError } from '../http/errors.js';
import { requireAuthentication } from './session.js';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE = 'qs_session';
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const identity = (user: User) => ({ id: user.id, displayName: user.displayName, role: user.role });
// Unknown accounts still perform Argon2id verification; no submitted secrets are cached.
let dummyHash: Promise<string> | undefined;
const fallbackHash = () => dummyHash ??= hash(randomBytes(32), { type: argon2id });

export function credentials(input: unknown) {
  const fields: Record<string, string> = {};
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address (up to 254 characters).';
  if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 256) fields.password = 'Enter a password (up to 256 characters).';
  if (Object.keys(body).some(key => key !== 'email' && key !== 'password')) fields.form = 'Only email and password are accepted.';
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Check the submitted fields.', { fields });
  return { email, password: body.password as string };
}

export function authentication(db: PrismaClient, now: () => Date, secure: boolean, webOrigin: string) {
  const cookies: CookieOptions = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
  const protect = requireAuthentication(db, now);
  const mutation: RequestHandler = (req, _res, next) => {
    // Missing and opaque ("null") origins are rejected as well as foreign origins.
    if (req.get('Origin') !== webOrigin) throw new ApiError(403, 'FORBIDDEN', 'Request origin is not allowed.');
    if (!req.is('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send application/json.');
    next();
  };
  const router = Router();
  const parseJson = json({ limit: '16kb', strict: false });
  router.post('/login', parseJson, mutation, async (req, res) => {
    const { email, password } = credentials(req.body);
    const user = await db.user.findUnique({ where: { email } });
    const storedHash = user?.passwordHash.startsWith('$argon2id$') ? user.passwordHash : await fallbackHash();
    const valid = await verify(storedHash, password);
    if (!valid || !user?.isActive || !user.passwordHash.startsWith('$argon2id$')) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    const token = randomBytes(32).toString('base64url');
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    await db.session.create({ data: { userId: user.id, tokenHash: tokenHash(token), createdAt, expiresAt } });
    res.cookie(COOKIE, token, { ...cookies, maxAge: SESSION_TTL_MS });
    res.json({ data: { user: identity(user), expiresAt: expiresAt.toISOString() } });
  });
  router.get('/me', protect, (_req, res) => { res.json({ data: { user: res.locals.user } }); });
  router.post('/logout', protect, mutation, parseJson, async (_req, res) => {
    await db.session.update({ where: { id: res.locals.session.id }, data: { revokedAt: now() } });
    res.clearCookie(COOKIE, cookies);
    res.status(204).end();
  });
  return { router, protect, mutation };
}

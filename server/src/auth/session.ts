import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import { ApiError } from '../http/errors.js';

/** Resolve identity from the current database session and user, never request claims. */
export function requireAuthentication(db: PrismaClient, now: () => Date = () => new Date()): RequestHandler {
  return async (req, res, next) => {
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('qs_session='));
    const token = cookie?.slice('qs_session='.length);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await db.session.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= now() || !session.user.isActive) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    }
    res.locals.session = session;
    res.locals.user = { id: session.user.id, displayName: session.user.displayName, role: session.user.role };
    next();
  };
}

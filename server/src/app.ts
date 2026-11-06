import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { database } from './infrastructure/database.js';
import { authentication } from './auth/auth.js';
import { ApiError, sendError } from './http/errors.js';

interface AppOptions {
  db?: PrismaClient;
  now?: () => Date;
  webOrigin?: string;
}
export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'restaurant-queue-api' });
  });
  app.use('/api/v1', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '16kb', strict: false }));
  const auth = authentication(
    options.db ?? database,
    options.now ?? (() => new Date()),
    process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173',
  );
  app.use('/api/v1/auth', auth.router);
  // Shared session gate for future private routers; queue behavior remains unimplemented.
  app.use(['/api/v1/queues', '/api/v1/customer', '/api/v1/operator'], auth.protect, (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return auth.mutation(req, res, next);
    next();
  });
  app.use((_req, res) => sendError(res, new ApiError(404, 'NOT_FOUND', 'Resource not found.')));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ApiError) { sendError(res, error); return; }
    const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    if (type === 'entity.parse.failed') { sendError(res, new ApiError(400, 'MALFORMED_JSON', 'Malformed JSON body.')); return; }
    if (type === 'entity.too.large') { sendError(res, new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')); return; }
    // Do not serialize/log exception objects, request bodies, credentials or cookies.
    sendError(res, new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'));
  };
  app.use(errors);
  return app;
}

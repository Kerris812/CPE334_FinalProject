import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { database } from './infrastructure/database.js';
import { authentication } from './auth/auth.js';
import { requireRole, requireQueueAssignment, requireEntryAssignment, currentUser } from './authorization/guards.js';
import { queueRoutes, customerEntryRoutes, publicBoardRoutes } from './queues/routes.js';
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
  const parseJson = express.json({ limit: '16kb', strict: false });
  const db = options.db ?? database;
  const auth = authentication(
    db,
    options.now ?? (() => new Date()),
    process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173',
  );
  app.use('/api/v1/auth', auth.router);
  // Shared session gate for private routers.
  const privateNamespaces = ['/api/v1/queues', '/api/v1/customer', '/api/v1/operator'];
  // Identity and role take precedence over body parsing and mutation content checks.
  app.use(privateNamespaces, auth.protect);
  app.use('/api/v1/operator', requireRole('OPERATOR'));
  app.use(['/api/v1/queues', '/api/v1/customer'], requireRole('CUSTOMER'));
  app.use(privateNamespaces, (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return auth.mutation(req, res, next);
    next();
  }, parseJson);
  app.use('/api/v1/queues', queueRoutes(db));
  app.use('/api/v1/customer/entries', customerEntryRoutes(db));
  app.use('/api/v1/public/queues', publicBoardRoutes(db));
  app.get('/api/v1/operator/queues', async (_req, res) => {
    const queues = await db.queue.findMany({
      where: { assignments: { some: { operatorId: currentUser(res).id } } },
      select: { id: true, code: true, name: true, state: true },
      orderBy: { code: 'asc' },
    });
    res.json({ data: queues });
  });
  // Reserve guards for future workflows; authorized requests still fall through to 404.
  app.get('/api/v1/operator/queues/:queueId/desk', requireQueueAssignment(db));
  app.post('/api/v1/operator/queues/:queueId/call-next', requireQueueAssignment(db));
  app.post('/api/v1/operator/entries/:entryId/start-service', requireEntryAssignment(db));
  app.post('/api/v1/operator/entries/:entryId/complete', requireEntryAssignment(db));
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

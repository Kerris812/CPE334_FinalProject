import express from 'express';
import { randomUUID } from 'node:crypto';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'restaurant-queue-api' });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.', requestId: randomUUID() } });
  });
  return app;
}

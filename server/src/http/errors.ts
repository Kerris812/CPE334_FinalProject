import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { fields: Record<string, string> }) {
    super(message);
  }
}
export function sendError(res: Response, error: ApiError) {
  res.status(error.status).json({ error: {
    code: error.code, message: error.message, requestId: randomUUID(),
    ...(error.details ? { details: error.details } : {}),
  } });
}

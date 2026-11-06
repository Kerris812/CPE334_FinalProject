import request from 'supertest';
import { expect, test } from 'vitest';
import { createApp } from '../../src/app.js';

test('TEST-014 anonymous health returns only safe status and service', async () => {
  const response = await request(createApp()).get('/health');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.body).toEqual({ status: 'ok', service: 'restaurant-queue-api' });
  expect(response.headers['x-powered-by']).toBeUndefined();
});

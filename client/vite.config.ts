import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: {
    '/api/v1': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
    '/health': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
  } },
  test: { environment: 'jsdom' },
});

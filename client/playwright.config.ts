import { defineConfig } from '@playwright/test';
const apiPort = process.env.E2E_API_PORT ?? '3000';
const webPort = process.env.E2E_WEB_PORT ?? '5173';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: webUrl },
  webServer: [
    { command: 'npm --prefix ../server run dev:e2e', url: `${apiUrl}/health`, reuseExistingServer: false, env: { PORT: apiPort, WEB_ORIGIN: webUrl } },
    { command: `npm run dev -- --port ${webPort}`, url: webUrl, reuseExistingServer: false, env: { API_PROXY_TARGET: apiUrl } },
  ],
});

import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { originalTypography, currentTypography } from './typography-baseline';
const root = '../artifacts/evidence/app-visual-system';
const pages = ['login', 'queues', 'my-queue', 'board', 'operator'] as const;
const entry = { id: 'visual-entry', queueCode: 'R', displayNumber: 'R-10000', partySize: 4, status: 'WAITING', joinedAt: '2026-11-07T04:55:00.000Z' };
const queues = [{ id: 'queue-r', code: 'R', name: 'Restaurant Waiting Queue', state: 'OPEN' }, { id: 'queue-s', code: 'S', name: 'Large Party Waiting Queue', state: 'OPEN' }];
for (const width of [360, 1440]) for (const name of pages) {
  test(`visual system ${name} at ${width}px`, async ({ page }) => {
    test.setTimeout(90000); mkdirSync(root, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    const reference = await originalTypography(page, name);
    const states = name === 'login' ? ['empty', 'loading', 'error'] : ['called', 'empty', 'serving', 'completed', 'error', 'loading', ...(name === 'queues' ? ['form'] : [])];
    for (const state of process.env.TYPOGRAPHY_ONLY ? states.slice(0, 1) : states) {
      let activeHandlers = 0;
      let release: (() => void) | undefined;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.unroute('**/api/v1/**');
      await page.route('**/api/v1/**', async route => {
        activeHandlers++;
        try {
        const url = new URL(route.request().url()).pathname;
        const user = ['login', 'board'].includes(name) ? null : { id: 'visual-user', displayName: name === 'operator' ? 'Operator A' : 'Customer A', role: name === 'operator' ? 'OPERATOR' : 'CUSTOMER' };
        if (url.endsWith('/auth/me')) return await route.fulfill({ status: user ? 200 : 401, json: user ? { data: { user } } : { error: { code: 'UNAUTHENTICATED' } } });
        if (name === 'login' && url.endsWith('/auth/login')) { if (state === 'loading') await gate; return await route.fulfill({ status: 401, json: { error: { code: 'INVALID_CREDENTIALS' } } }); }
        if (state === 'loading') await gate;
        if (state === 'error') return await route.fulfill({ status: 503, json: { error: { code: 'INTERNAL_ERROR', message: 'DO NOT RENDER raw diagnostics' } } });
        const status = state === 'serving' ? 'SERVING' : state === 'completed' ? 'COMPLETED' : 'CALLED';
        let data: unknown;
        if (url.endsWith('/operator/queues')) data = [queues[0]];
        else if (url.endsWith('/desk')) data = { queue: queues[0], waitingCount: state === 'empty' ? 0 : 2, nextWaiting: state === 'empty' ? null : { ...entry, displayNumber: 'R-10001', status: 'WAITING' }, activeEntry: ['empty', 'completed'].includes(state) ? null : { ...entry, status } };
        else if (url.endsWith('/entries/latest')) data = ['empty','form'].includes(state) ? null : { ...entry, status };
        else if (url.endsWith('/board')) data = { queueCode: url.includes('/S/') ? 'S' : 'R', calledNumber: ['empty', 'completed'].includes(state) ? null : url.includes('/S/') ? 'S-0001' : 'R-10000', serviceState: ['empty', 'completed'].includes(state) ? null : status, waitingCount: state === 'empty' ? 0 : 2 };
        else if (url.endsWith('/queues')) data = state === 'empty' ? [] : queues;
        return await route.fulfill({ json: { data } });
        } finally { activeHandlers--; }
      });
      await page.setViewportSize({ width, height: 1000 });
      const path = name === 'operator' ? '/operator/desk' : `/${name}`;
      await page.goto(path);
      if (name === 'login') {
        await expect(page.getByLabel('Email')).toBeVisible();
        if (state !== 'empty') { await page.getByLabel('Email').fill('visual@example.test'); await page.getByLabel('Password', { exact: true }).fill('synthetic-visual-fixture'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); if (state === 'error') await expect(page.getByRole('alert')).toBeVisible(); else await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeVisible(); }
      } else if (state === 'loading') await expect(page.getByText(/Loading (queue information|public queue status|assigned queues)/).first()).toBeVisible();
      else if (state === 'error') await expect(page.getByRole('alert').first()).toBeVisible();
      else if (name === 'my-queue' || name === 'queues') await expect(['empty','form'].includes(state) ? (state === 'form' ? page.getByRole('button', { name: 'Join queue', exact: true }) : page.getByText(name === 'my-queue' ? 'You have no queue entry.' : 'No open queues are available.')) : page.getByText('R-10000', { exact: true })).toBeVisible();
      else if (name === 'board') await expect(page.getByRole('heading', { name: 'Queue R', exact: true })).toBeVisible();
      else await expect(page.getByLabel('Assigned queue')).toBeVisible();
      if (!['error','loading','empty'].includes(state) || (name === 'login' && state === 'empty')) {
        const actual = await currentTypography(page, name);
        const expected = Object.fromEntries(Object.keys(actual).map(key => [key, reference[key]]));
        writeFileSync(`${root}/typography-${name}-${width}.json`, JSON.stringify({ reference: expected, actual }, null, 2));
        expect(actual).toEqual(expected);
      }
      if (state === states[0] && width === 360) {
        for (const viewport of [360, 768, 1024, 1440]) {
          await page.setViewportSize({ width: viewport, height: 1000 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          for (const control of await page.locator('a, button, input, select').all()) {
            if (!await control.isVisible()) continue;
            const box = (await control.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
        await page.setViewportSize({ width, height: 1000 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('h1')).toHaveCount(1);
      for (const control of await page.locator('a, button, input, select').all()) {
        if (!await control.isVisible()) continue;
        const box = (await control.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByText('DO NOT RENDER raw diagnostics')).toHaveCount(0);
      await page.screenshot({ path: `${root}/${name}-${state}-${width}.png`, fullPage: true, animations: 'disabled' });
      release?.();
      await expect.poll(() => activeHandlers).toBe(0);
    }
  });
}

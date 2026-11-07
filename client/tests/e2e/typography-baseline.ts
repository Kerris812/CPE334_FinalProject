import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
const css = ['base','public','customer'].map(name => readFileSync(`../artifacts/evidence/app-visual-system/before-${name}.css`, 'utf8')).join('\n');
// Representative original markup resolves the saved, unchanged pre-migration CSS in Chromium.
// This is a CSS typography reference, not a screenshot or a claimed deployment of the old app.
export async function originalTypography(page: Page, name: string) {
  const publicPage = name === 'board'; const customer = name === 'my-queue';
  const body = `<main class="${publicPage ? 'public-display-page' : customer ? 'customer-status-page' : ''}">
    ${customer ? '<span data-probe="wordmark" class="customer-wordmark">Restaurant Queue</span>' : '<h1 data-probe="wordmark">Restaurant Queue</h1>'}
    ${['queues','operator','my-queue'].includes(name) ? `<div class="${customer ? 'customer-user-details' : 'account'}"><strong data-probe="identity">Customer A</strong><${customer ? 'span class="customer-user-role"' : 'p'} data-probe="role">CUSTOMER</${customer ? 'span' : 'p'}></div>` : ''}
    <nav class="${customer ? 'customer-header-actions' : ''}"><a data-probe="board-link" class="${customer ? '' : 'board-link'}">View public board</a></nav>
    <section class="${name === 'login' ? 'login-card' : customer ? 'customer-status' : publicPage ? 'public-board' : name === 'operator' ? 'operator-desk' : 'customer-queues'}">
    ${customer ? '<h1 data-probe="title">My queue</h1>' : publicPage ? '<h2 data-probe="title" class="public-display-title">Public queue display</h2>' : '<h2 data-probe="title">Section</h2>'}
    <label data-probe="label">Label</label><input data-probe="input" />
    <section class="queue-ticket"><p data-probe="number-label" class="${publicPage ? 'board-call-label' : ''}">Number</p><strong data-probe="number" class="${publicPage ? 'public-called-number' : 'queue-number'}">R-10000</strong><p data-probe="badge" class="queue-status status-called ${publicPage ? 'board-status' : ''}">CALLED</p></section>
    <button data-probe="button" class="${name === 'login' ? 'password-toggle' : publicPage ? 'board-secondary' : ''}">Action</button>
    <div class="queue-form"><h3 data-probe="form-title">Queue</h3><form><button type="submit" data-probe="submit">Submit</button></form></div></section></main>`;
  await page.setContent(`<style>${css}</style>${body}`);
  return page.locator('[data-probe]').evaluateAll(elements => Object.fromEntries(elements.map(element => { const s = getComputedStyle(element); return [element.getAttribute('data-probe')!, { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight }]; })));
}
export async function currentTypography(page: Page, name: string) {
  const selectors: Record<string, string> = { wordmark: '.app-wordmark', 'board-link': '.board-link', identity: '.customer-user-details strong', role: '.customer-user-role', submit: 'form button[type=submit]', 'form-title': '.queue-form h3', title: name === 'login' ? '.login-card h2' : name === 'my-queue' ? '.customer-status h1' : name === 'board' ? 'h2.public-display-title' : name === 'operator' ? '.operator-desk h2' : '.customer-queues h2', number: name === 'board' ? '.public-called-number' : '.queue-number', badge: name === 'board' ? '.board-status' : '.queue-status', button: name === 'login' ? '.password-toggle' : name === 'board' ? '.public-board button' : name === 'my-queue' ? '.customer-status button' : name === 'operator' ? '.desk-refresh' : '', label: 'label', input: 'input', 'number-label': '.queue-ticket > p' };
  // Only compare elements that exist on this real page; never invent queue states on login.
  const result: Record<string, { family: string; size: string; weight: string }> = {};
  for (const [key, selector] of Object.entries(selectors)) {
    if (!selector || !await page.locator(selector).count()) continue;
    result[key] = await page.locator(selector).first().evaluate(element => { const s = getComputedStyle(element); return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight }; });
  }
  return result;
}

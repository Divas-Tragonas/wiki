/* Ajudes de les proves de punta a punta: estat conegut a l'API i passos habituals al tauler. */
import { readFileSync } from 'node:fs';
import { expect, request, type Page } from '@playwright/test';
import { API } from '../playwright.config';

export const CAMPAIGN = JSON.parse(readFileSync(new URL('./fixtures/campaign.json', import.meta.url), 'utf8'));

export async function dmToken(): Promise<string> {
  const ctx = await request.newContext();
  const r = await ctx.post(API + '/v1/session', { data: { role: 'dm', password: 'dm', label: 'e2e' } });
  expect(r.ok()).toBeTruthy();
  const { token } = await r.json();
  await ctx.dispose();
  return token;
}

export async function apiCall(method: string, path: string, data?: unknown) {
  const token = await dmToken();
  const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: 'Bearer ' + token } });
  const r = await ctx.fetch(API + path, { method, data });
  const body = r.status() === 204 ? null : await r.json();
  await ctx.dispose();
  return { status: r.status(), body };
}

/* la campanya de les proves, sencera (els taulers oberts reben l'ordre de recarregar) */
export async function resetCampaign() {
  const r = await apiCall('POST', '/v1/import?mode=replace', CAMPAIGN);
  expect(r.status).toBe(200);
}

export const quest = async (id: string) => (await apiCall('GET', `/v1/quests/${id}`)).body.quest;

/* obre el tauler i hi entra amb la contrasenya del grup si cal */
export async function openBoard(page: Page, town = 'phentanil') {
  await page.addInitScript(() => { try { localStorage.setItem('phx.fx', '"quieta"'); } catch { /* sense emmagatzematge */ } });
  await page.goto('/wiki/missions/' + (town === 'phentanil' ? '' : '?lloc=' + town));
  const gate = page.locator('#gate input');
  await Promise.race([gate.waitFor({ timeout: 15_000 }).catch(() => {}), page.locator('#docs .doc').first().waitFor({ timeout: 15_000 })]);
  if (await gate.isVisible()) {
    await gate.fill('grup');
    await gate.press('Enter');
    await expect(page.locator('#gate')).toBeHidden();
  }
  await expect(page.locator('#docs .doc').first()).toBeVisible();
  await page.waitForTimeout(600);
}

export async function enterDm(page: Page) {
  await page.keyboard.press('d');
  const gate = page.locator('#gate input');
  if (await gate.isVisible({ timeout: 1500 }).catch(() => false)) {
    await gate.fill('dm');
    await gate.press('Enter');
  }
  await expect(page.locator('#dmbar')).toBeVisible();
  await expect(page.locator('#dmbar .stat')).toHaveText('Tot desat');
}

/* obre un paper clicant-ne el títol */
export async function openPaper(page: Page, id: string) {
  await page.locator(`.doc[data-id="${id}"] .d-t`).click({ force: true });
  await expect(page.locator(`.doc[data-id="${id}"]`)).toHaveClass(/zoomed/);
  await page.waitForTimeout(400);
}

export const boardIds = (page: Page) => page.$$eval('#docs .doc', (els) => els.map((e) => (e as HTMLElement).dataset.id).sort());
export const saved = (page: Page) => expect(page.locator('#dmbar .stat')).toHaveText('Tot desat');

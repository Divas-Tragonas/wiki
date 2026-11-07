import { expect, test, type Page } from '@playwright/test';
import { API } from '../playwright.config';
import { apiCall, boardIds, enterDm, openBoard, openPaper, quest, resetCampaign, saved } from './support';

test.beforeEach(async () => {
  await resetCampaign();
});

test.describe('players', () => {
  test('enter without a password and see only what players may see', async ({ page }) => {
    const bodies: string[] = [];
    page.on('response', async (r) => {
      if (r.url().startsWith(API) && !r.url().includes('/events')) bodies.push(await r.text().catch(() => ''));
    });
    await page.goto('/wiki/missions/');
    await expect(page.locator('#docs .doc')).toHaveCount(4);
    await expect(page.locator('#gate')).toBeHidden();
    expect(await boardIds(page)).toEqual(['q1', 'q2', 'q3', 'q6']);
    await expect(page.locator('#pileN')).toHaveText('1');
    expect(bodies.join('\n')).not.toContain('Nota secreta');
    expect(bodies.join('\n')).not.toContain('Secret del DM');
  });

  test('stay signed in on this screen', async ({ page }) => {
    await openBoard(page);
    await page.reload();
    await expect(page.locator('#docs .doc')).toHaveCount(4);
    await expect(page.locator('#gate')).toBeHidden();
  });

  test('see each town\'s own board', async ({ page }) => {
    await openBoard(page, 'cony-cirera');
    expect(await boardIds(page)).toEqual(['q2', 'q7']);
    await expect(page).toHaveTitle(/Missions de Cony Cirera/);
  });
});

test.describe('DM editing', () => {
  test('edits on the paper are saved to the server', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await openPaper(page, 'q1');
    await page.click('.doc[data-id="q1"] .d-t');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Títol des del tauler');
    await page.click('.doc[data-id="q1"] li[data-i="1"] .bx');
    await page.click('.doc[data-id="q1"] [data-act="addstep"]');
    await page.keyboard.type('Objectiu nou');
    await page.keyboard.press('Enter');
    await page.keyboard.type('I un altre');
    await page.click('#dmcard input[data-k="giver"]');
    await page.keyboard.press('End');
    await page.keyboard.type(' i Hèlia');
    await page.selectOption('#dmcard select[data-k="place"]', 'ferreria');
    await page.waitForTimeout(700);
    await saved(page);
    const q = await quest('q1');
    expect(q).toMatchObject({ title: 'Títol des del tauler', giver: 'Sildar Flocdeneu i Hèlia', towns: { phentanil: 'ferreria' } });
    expect(q.steps.map((s: any) => [s.text, s.done])).toEqual([
      ['Parlar amb Sildar', true], ['Trobar el mapa', true], ['Entrar a la mina', false], ['Objectiu nou', false], ['I un altre', false]
    ]);
    /* i en tornar a carregar, hi és */
    await page.reload();
    await expect(page.locator('.doc[data-id="q1"] .d-t')).toHaveText('Títol des del tauler');
  });

  test('complete, hide, reveal and follow from the DM card', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await openPaper(page, 'q4');
    await page.click('#dmcard [data-q="reveal"]');
    await saved(page);
    expect((await quest('q4')).hidden).toBe(false);
    await page.click('#dmcard [data-q="track"]');
    await saved(page);
    expect((await apiCall('GET', '/v1/boards/phentanil')).body.tracked).toBe('q4');
    await page.click('#dmcard [data-q="complete"]');
    await saved(page);
    expect((await quest('q4')).status).toBe('done');
    expect((await apiCall('GET', '/v1/boards/phentanil')).body.tracked).toBeNull();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pileN')).toHaveText('2');
  });

  test('new quests start hidden and are created on the server', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await page.click('[data-dm="new"]');
    await page.waitForTimeout(1200);
    await page.keyboard.type('Missió de prova');
    await page.click('#dmcard .dmc-k');
    await saved(page);
    const all = (await apiCall('GET', '/v1/boards/phentanil')).body.quests;
    expect(all.find((q: any) => q.title === 'Missió de prova')).toMatchObject({ hidden: true, cat: 'secundaria', towns: { phentanil: null } });
  });

  test('delete asks twice, and undo in the history brings it back', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await openPaper(page, 'q3');
    await page.click('#dmcard [data-q="delete"]');
    await expect(page.locator('#toast')).toContainText('Torna a clicar');
    await page.click('#dmcard [data-q="delete"]');
    await saved(page);
    expect((await apiCall('GET', '/v1/quests/q3')).status).toBe(404);
    await page.click('[data-dm="history"]');
    await expect(page.locator('#hist .hs-list li').first()).toContainText('Eliminada «El llibre perdut»');
    await page.locator('#hist [data-h="undo"]').first().click();
    await expect(page.locator('.doc[data-id="q3"]')).toBeVisible();
    expect((await quest('q3')).title).toBe('El llibre perdut');
  });

  test('moving papers saves their positions', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await page.click('[data-dm="arrange"]');
    const box = (await page.locator('.doc[data-id="q2"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await saved(page);
    const layout = (await apiCall('GET', '/v1/boards/phentanil')).body.layout;
    expect(layout.q2).toMatchObject({ cx: expect.any(Number), cy: expect.any(Number), w: expect.any(Number) });
    await page.locator('.doc[data-id="q2"]').dblclick({ force: true });
    await saved(page);
    expect((await apiCall('GET', '/v1/boards/phentanil')).body.layout.q2).toBeUndefined();
  });

  test('a place card text is saved', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await page.keyboard.press('m');
    await page.waitForTimeout(900);
    await page.click('.plc[data-p="ferreria"] .hit', { force: true });
    await page.click('#pcard .pc-x');
    await page.keyboard.type('Fum i soroll.');
    await page.waitForTimeout(900);
    await saved(page);
    expect((await apiCall('GET', '/v1/boards/phentanil')).body.places.ferreria).toBe('Fum i soroll.');
  });

  test('leaving DM mode needs the password again and forgets hidden quests', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    expect(await boardIds(page)).toContain('q4');
    await page.click('[data-dm="exit"]');
    await expect(page.locator('#dmbar')).toBeHidden();
    await page.waitForTimeout(800);
    expect(await boardIds(page)).not.toContain('q4');
    await page.keyboard.press('d');
    await expect(page.locator('#gate input')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('export downloads everything and a town file merges into that board', async ({ page }) => {
    await openBoard(page, 'cony-cirera');
    await enterDm(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-dm="export"]')]);
    const exported = JSON.parse(await (await import('node:fs/promises')).readFile((await dl.path())!, 'utf8'));
    expect(exported.quests.map((q: any) => q.id)).toContain('q4');
    expect(exported.quests.find((q: any) => q.id === 'q4').note).toBe('Nota secreta');
    const file = { board: 'cony-cirera', quests: [{ id: 'x1', title: 'Llops al bosc', note: 'de Cony' }, { id: 'x2', title: 'Nova de Cony', place: 'farga' }] };
    await page.setInputFiles('#impFile', { name: 'cony.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await expect(page.locator('#toast')).toContainText('1 missions noves i 1 enllaçades');
    await expect(page.locator('#docs .doc')).toHaveCount(3);
  });
});

test.describe('live updates', () => {
  async function two(browser: import('@playwright/test').Browser): Promise<[Page, Page]> {
    const tv = await (await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 900 } })).newPage();
    const dm = await (await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 900 } })).newPage();
    await openBoard(tv);
    await openBoard(dm);
    await enterDm(dm);
    return [tv, dm];
  }

  test('the TV follows the DM without reloading', async ({ browser }) => {
    const [tv, dm] = await two(browser);
    await openPaper(dm, 'q1');
    await dm.click('.doc[data-id="q1"] .d-t');
    await dm.keyboard.press('Control+A');
    await dm.keyboard.type('Ho veu la tele');
    await dm.keyboard.press('Enter');
    await expect(tv.locator('.doc[data-id="q1"] .d-t')).toHaveText('Ho veu la tele');
    await dm.keyboard.press('Escape');
    await openPaper(dm, 'q4');
    await dm.click('#dmcard [data-q="reveal"]');
    await expect(tv.locator('.doc[data-id="q4"]')).toBeVisible();
    await dm.click('#dmcard [data-q="complete"]');
    await expect(tv.locator('#pileN')).toHaveText('2');
    await expect(tv.locator('.doc[data-id="q4"]')).toHaveCount(0);
    await dm.click('#dmcard [data-q="reopen"]');
    await dm.click('#dmcard [data-q="hide"]');
    await expect(tv.locator('#pileN')).toHaveText('1');
    await expect(tv.locator('.doc[data-id="q4"]')).toHaveCount(0);
    /* la tele no ha rebut mai la nota del DM */
    expect(await tv.evaluate(() => document.body.innerText)).not.toContain('Nota secreta');
  });

  test('two DM screens editing the same quest end up agreeing', async ({ browser }) => {
    const [, a] = await two(browser);
    const b = await (await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1600, height: 900 } })).newPage();
    await openBoard(b);
    await enterDm(b);
    /* la pantalla B no s'assabenta de res (sense canal en directe): edita una versió vella */
    await b.route('**/v1/events**', (r) => r.abort());
    await b.evaluate(() => window.dispatchEvent(new Event('offline')));
    await openPaper(a, 'q1');
    await openPaper(b, 'q1');
    await a.click('#dmcard input[data-k="giver"]');
    await a.keyboard.press('Control+A');
    await a.keyboard.type('Des de la pantalla A');
    await a.waitForTimeout(800);
    await saved(a);
    await b.click('#dmcard input[data-k="giver"]');
    await b.keyboard.press('Control+A');
    await b.keyboard.type('Des de la pantalla B');
    await expect(b.locator('#toast')).toContainText('Una altra pantalla havia canviat');
    await expect(b.locator('#dmcard input[data-k="giver"]')).toHaveValue('Des de la pantalla A');
    expect((await quest('q1')).giver).toBe('Des de la pantalla A');
  });
});

test.describe('without the server', () => {
  test('the board shows its last copy, read-only, and recovers', async ({ page }) => {
    await openBoard(page);
    await page.route(API + '/**', (r) => r.abort());
    await page.reload();
    await expect(page.locator('#docs .doc')).toHaveCount(4);
    await expect(page.locator('#net')).toContainText('només per mirar');
    await page.keyboard.press('d');
    await expect(page.locator('#toast')).toContainText('Sense connexió');
    await page.unroute(API + '/**');
    await expect(page.locator('#net')).toBeHidden({ timeout: 20_000 });
    await apiCall('PATCH', '/v1/quests/q1', { title: 'Després de tornar' });
    await expect(page.locator('.doc[data-id="q1"] .d-t')).toHaveText('Després de tornar');
  });

  test('DM changes wait while offline and are saved when the server is back', async ({ page }) => {
    await openBoard(page);
    await enterDm(page);
    await openPaper(page, 'q1');
    await page.route(API + '/v1/quests/**', (r) => r.abort());
    await page.click('.doc[data-id="q1"] li[data-i="1"] .bx');
    await expect(page.locator('#dmbar .stat')).toHaveText(/Sense connexió/);
    expect((await quest('q1')).steps[1].done).toBe(false);
    await page.unroute(API + '/v1/quests/**');
    await saved(page);
    expect((await quest('q1')).steps[1].done).toBe(true);
  });
});

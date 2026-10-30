import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCampaign, setupEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
let dm: string;
let player: string;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.close(); });
beforeEach(async () => {
  await env.reset();
  dm = await env.login('dm');
  player = await env.login('player');
  await seedCampaign(env, dm);
});

const board = async (token: string, town = 'phentanil') => (await env.req('GET', `/v1/boards/${town}`, { token })).body;

describe('GET /v1/boards/:town', () => {
  it('gives players the visible quests of that town, without notes', async () => {
    const b = await board(player);
    expect(b).toMatchObject({ role: 'player', town: 'phentanil', tracked: 'q1', party: { level: 1, title: '' } });
    expect(b.rev).toBeGreaterThan(0);
    expect(b.quests.map((q: any) => q.id)).toEqual(['q1', 'q3']);
    expect(b.quests[0]).not.toHaveProperty('note');
    expect(b.quests[0].steps).toEqual([{ id: 's1', text: 'Parlar amb Sildar', done: true }, { id: 's2', text: 'Trobar el mapa', done: false }]);
    expect(Object.keys(b.layout).sort()).toEqual(['map', 'q1']);
    expect(b.ecos).toEqual([
      { id: 'e1', num: 1, position: 0, title: 'Primer eco', text: 'Una veu', unlocked: true },
      { id: 'e2', num: 2, position: 1, title: '', text: '', unlocked: false }
    ]);
  });

  it('gives the DM everything on that town', async () => {
    const b = await board(dm);
    expect(b.role).toBe('dm');
    expect(b.quests.map((q: any) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(b.quests[1]).toMatchObject({ hidden: true, note: 'NOTA-SECRETA-2' });
    expect(Object.keys(b.layout).sort()).toEqual(['map', 'q1', 'q2']);
    expect(b.ecos[1].text).toBe('TEXT-ECO-BLOQUEJAT');
  });

  it('shows each town its own quests and keeps completed ones', async () => {
    expect((await board(player, 'cony-cirera')).quests.map((q: any) => q.id)).toEqual(['q3', 'q4']);
    await env.req('POST', '/v1/quests/q3/complete', { token: dm });
    const b = await board(player, 'cony-cirera');
    expect(b.quests.find((q: any) => q.id === 'q3').status).toBe('done');
  });

  it('answers 404 for unknown towns', async () => {
    expect((await env.req('GET', '/v1/boards/atlantis', { token: player })).status).toBe(404);
  });

  it('lists the towns', async () => {
    expect((await env.req('GET', '/v1/towns', { token: player })).body.towns).toEqual([{ id: 'phentanil', name: 'Phentanil' }, { id: 'cony-cirera', name: 'Cony Cirera' }]);
  });

  it('serves single quests by role', async () => {
    expect((await env.req('GET', '/v1/quests/q2', { token: player })).status).toBe(404);
    expect((await env.req('GET', '/v1/quests/q2', { token: dm })).body.quest.note).toBe('NOTA-SECRETA-2');
    expect((await env.req('GET', '/v1/quests/q1', { token: player })).body.quest).not.toHaveProperty('note');
  });
});

describe('ecos', () => {
  it('creates, unlocks, edits and removes', async () => {
    const c = await env.req('POST', '/v1/ecos', { token: dm, body: { num: 3, title: 'Tercer' } });
    expect(c.status).toBe(201);
    expect(c.body.eco).toMatchObject({ num: 3, title: 'Tercer', unlocked: false, position: 2 });
    expect((await env.req('POST', '/v1/ecos', { token: dm, body: { id: 'e1' } })).body.error.code).toBe('eco_exists');
    const u = await env.req('PATCH', '/v1/ecos/e2', { token: dm, body: { unlocked: true } });
    expect(u.body.eco).toMatchObject({ id: 'e2', unlocked: true, position: 1 });
    expect((await board(player)).ecos[1].text).toBe('TEXT-ECO-BLOQUEJAT');
    expect((await env.req('PATCH', '/v1/ecos/nope', { token: dm, body: { unlocked: true } })).status).toBe(404);
    expect((await env.req('DELETE', '/v1/ecos/e2', { token: dm })).status).toBe(200);
    expect((await env.req('DELETE', '/v1/ecos/e2', { token: dm })).status).toBe(404);
    expect((await board(dm)).ecos.map((e: any) => e.id)).toEqual(['e1', c.body.eco.id]);
  });
});

describe('place texts', () => {
  it('sets and resets a place card text per town', async () => {
    const r = await env.req('PUT', '/v1/boards/phentanil/places/ajuntament', { token: dm, body: { text: 'Text del DM' } });
    expect(r.body).toMatchObject({ place: 'ajuntament', text: 'Text del DM' });
    expect((await board(player)).places).toEqual({ ajuntament: 'Text del DM' });
    expect((await board(player, 'cony-cirera')).places).toEqual({});
    await env.req('DELETE', '/v1/boards/phentanil/places/ajuntament', { token: dm });
    expect((await board(player)).places).toEqual({});
  });

  it('only accepts places on that town\'s map', async () => {
    expect((await env.req('PUT', '/v1/boards/phentanil/places/pou', { token: dm, body: { text: 'x' } })).status).toBe(404);
    expect((await env.req('PUT', '/v1/boards/phentanil/places/tauler', { token: dm, body: { text: 'x' } })).status).toBe(404);
  });
});

describe('layout', () => {
  it('places, moves and resets pieces in one call', async () => {
    const r = await env.req('PATCH', '/v1/boards/phentanil/layout', {
      token: dm,
      body: { pieces: { pile: { x: 70, y: 600, r: -3 }, q3: { cx: 1500, cy: 400, r: 1, w: 300, h: 420, z: 50 }, map: null } }
    });
    expect(r.status).toBe(200);
    expect(r.body.layout).toEqual({
      pile: { x: 70, y: 600, r: -3 },
      q1: { cx: 500, cy: 500, r: 2, w: 285, h: 398, z: 41 },
      q2: { cx: 900, cy: 400, r: 0, w: 285, h: 398, z: 42 },
      q3: { cx: 1500, cy: 400, r: 1, w: 300, h: 420, z: 50 }
    });
  });

  it('refuses pieces that are not on that board and bad poses', async () => {
    expect((await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { q4: { cx: 1, cy: 1, r: 0 } } } })).body.error.code).toBe('unknown_piece');
    expect((await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { q1: { cx: 1, r: 0 } } } })).status).toBe(422);
    expect((await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { q1: { cx: 1, cy: 1, r: 0, hack: 1 } } } })).status).toBe(422);
    /* treure una peça que no existeix sempre es pot */
    expect((await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { ghost: null } } })).status).toBe(200);
  });
});

describe('party', () => {
  it('updates level and title', async () => {
    const r = await env.req('PATCH', '/v1/party', { token: dm, body: { level: 3, title: 'Els del Phentanilo' } });
    expect(r.body.party).toEqual({ level: 3, title: 'Els del Phentanilo' });
    expect((await board(player)).party).toEqual({ level: 3, title: 'Els del Phentanilo' });
    expect((await env.req('PATCH', '/v1/party', { token: dm, body: { level: 0 } })).status).toBe(422);
  });
});

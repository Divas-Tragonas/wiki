import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORDS, setupEnv, type TestEnv } from './helpers.ts';
import { hashPassword, normalizePassword, verifyPassword } from '../src/auth/passwords.ts';
import { setPasswordHash } from '../src/auth/sessions.ts';

let env: TestEnv;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.close(); });
beforeEach(async () => { await env.reset(); });

describe('passwords', () => {
  it('ignores case and extra spaces, like the board always did', async () => {
    expect(normalizePassword('  Drac   VERMELL ')).toBe('drac vermell');
    const h = await hashPassword('Drac Vermell');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword(' drac   vermell', h)).toBe(true);
    expect(await verifyPassword('drac blau', h)).toBe(false);
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
  });
});

describe('POST /v1/session', () => {
  it('creates a player session without a password that can read but not write', async () => {
    const r = await env.req('POST', '/v1/session', { body: { role: 'player' } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ role: 'player', token: expect.any(String), id: expect.any(String) });
    const t = r.body.token;
    expect((await env.req('GET', '/v1/session', { token: t })).body.role).toBe('player');
    expect((await env.req('GET', '/v1/boards/phentanil', { token: t })).status).toBe(200);
    const w = await env.req('POST', '/v1/quests', { token: t, body: { towns: { phentanil: null } } });
    expect(w.status).toBe(403);
    expect(w.body.error.code).toBe('dm_only');
  });

  it('ignores a password sent for a player session (boards built before it was removed)', async () => {
    const r = await env.req('POST', '/v1/session', { body: { role: 'player', password: 'qualsevol' } });
    expect(r.status).toBe(201);
    expect(r.body.role).toBe('player');
  });

  it('does not count player sessions against the failed-attempts limit', async () => {
    for (let i = 0; i < 5; i++) expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: 'x' + i } })).status).toBe(401);
    expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: PASSWORDS.dm } })).status).toBe(429);
    expect((await env.req('POST', '/v1/session', { body: { role: 'player' } })).status).toBe(201);
  });

  it('rejects a wrong or missing DM password, an unknown role and malformed bodies', async () => {
    expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: 'nope' } })).body.error.code).toBe('wrong_password');
    expect((await env.req('POST', '/v1/session', { body: { role: 'dm' } })).status).toBe(422);
    expect((await env.req('POST', '/v1/session', { body: { role: 'god', password: 'x' } })).status).toBe(422);
    expect((await env.req('POST', '/v1/session', { raw: '{not json' })).status).toBe(400);
  });

  it('says so when a password has not been set yet', async () => {
    await env.rt.database.db.execute(await import('drizzle-orm').then(({ sql }) => sql`delete from credentials where role = 'dm'`));
    const r = await env.req('POST', '/v1/session', { body: { role: 'dm', password: PASSWORDS.dm } });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('not_configured');
  });

  it('limits failed attempts per address and lets them through again after a minute', async () => {
    for (let i = 0; i < 5; i++) expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: 'x' + i } })).status).toBe(401);
    const blocked = await env.req('POST', '/v1/session', { body: { role: 'dm', password: PASSWORDS.dm } });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    env.clock.advance(61_000);
    expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: PASSWORDS.dm } })).status).toBe(201);
  });

  it('upgrades the same session to DM and back without a new token', async () => {
    const t = await env.login('player');
    const up = await env.req('POST', '/v1/session', { token: t, body: { role: 'dm', password: PASSWORDS.dm } });
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ role: 'dm', token: null });
    expect((await env.req('POST', '/v1/quests', { token: t, body: { towns: { phentanil: null } } })).status).toBe(201);
    /* entrar com a jugador amb una sessió de DM no li treu el permís */
    expect((await env.req('POST', '/v1/session', { token: t, body: { role: 'player' } })).body.role).toBe('dm');
    expect((await env.req('POST', '/v1/session/player', { token: t })).body.role).toBe('player');
    expect((await env.req('POST', '/v1/quests', { token: t, body: { towns: { phentanil: null } } })).status).toBe(403);
  });
});

describe('session lifetime', () => {
  it('requires a valid bearer token', async () => {
    expect((await env.req('GET', '/v1/boards/phentanil')).status).toBe(401);
    expect((await env.req('GET', '/v1/boards/phentanil', { token: 'made-up' })).status).toBe(401);
    expect((await env.req('GET', '/v1/boards/phentanil', { headers: { authorization: 'Basic abc' } })).status).toBe(401);
  });

  it('drops DM rights after 12 idle hours but keeps the player session', async () => {
    const t = await env.login('dm');
    env.clock.advance(11 * 3_600_000);
    expect((await env.req('GET', '/v1/session', { token: t })).body.role).toBe('dm');
    env.clock.advance(12 * 3_600_000 + 1000);
    expect((await env.req('GET', '/v1/session', { token: t })).body.role).toBe('player');
  });

  it('drops DM rights after 30 days even if used every day', async () => {
    const t = await env.login('dm');
    /* cada 6 hores durant 29 dies i 18 hores: mai no passa el límit d’inactivitat */
    for (let h = 0; h < 119; h++) {
      env.clock.advance(6 * 3_600_000);
      expect((await env.req('GET', '/v1/session', { token: t })).body.role).toBe('dm');
    }
    env.clock.advance(7 * 3_600_000);
    expect((await env.req('GET', '/v1/session', { token: t })).body.role).toBe('player');
  });

  it('expires a player session after a year', async () => {
    const t = await env.login('player');
    env.clock.advance(364 * 86_400_000);
    expect((await env.req('GET', '/v1/session', { token: t })).status).toBe(200);
    env.clock.advance(2 * 86_400_000);
    expect((await env.req('GET', '/v1/session', { token: t })).status).toBe(401);
  });

  it('signs out with DELETE /v1/session', async () => {
    const t = await env.login('player');
    expect((await env.req('DELETE', '/v1/session', { token: t })).status).toBe(204);
    expect((await env.req('GET', '/v1/session', { token: t })).status).toBe(401);
  });

  it('lets the DM list and revoke devices', async () => {
    const tv = await env.login('player', { label: 'Tele' });
    const dm = await env.login('dm', { label: 'Portàtil' });
    const list = await env.req('GET', '/v1/sessions', { token: dm });
    expect(list.body.sessions.map((s: any) => [s.label, s.role, s.current]).sort()).toEqual([['Portàtil', 'dm', true], ['Tele', 'player', false]]);
    expect((await env.req('GET', '/v1/sessions', { token: tv })).status).toBe(403);
    const id = list.body.sessions.find((s: any) => s.label === 'Tele').id;
    expect((await env.req('DELETE', `/v1/sessions/${id}`, { token: dm })).status).toBe(204);
    expect((await env.req('GET', '/v1/session', { token: tv })).status).toBe(401);
    expect((await env.req('DELETE', `/v1/sessions/${id}`, { token: dm })).status).toBe(404);
  });

  it('drops DM rights, but keeps the sessions, when the DM password changes', async () => {
    const player = await env.login('player');
    const dm = await env.login('dm');
    await setPasswordHash(env.rt.database.db, 'dm', await hashPassword('nova'), env.clock.now);
    expect((await env.req('GET', '/v1/session', { token: dm })).body.role).toBe('player');
    expect((await env.req('GET', '/v1/session', { token: player })).body.role).toBe('player');
    expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: PASSWORDS.dm } })).status).toBe(401);
    expect((await env.req('POST', '/v1/session', { body: { role: 'dm', password: 'Nova' } })).status).toBe(201);
  });
});

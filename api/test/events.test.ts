import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mutate } from '../src/store/uow.ts';
import { patchQuest } from '../src/services/domain.ts';
import { openStream, seedCampaign, setupEnv, type Stream, type TestEnv } from './helpers.ts';

let env: TestEnv;
let dm: string;
let player: string;
const open: Stream[] = [];
beforeAll(async () => { env = await setupEnv({ watchMs: 100 }); });
afterAll(async () => { await env.close(); });
beforeEach(async () => {
  open.splice(0).forEach((s) => s.close());
  await env.reset();
  dm = await env.login('dm');
  player = await env.login('player');
  await seedCampaign(env, dm);
});
const stream = async (token: string, town = 'phentanil', last?: number) => {
  const s = await openStream(env, token, town, last);
  open.push(s);
  return s;
};
const lastRev = async () => (await env.req('GET', '/v1/boards/phentanil', { token: dm })).body.rev;

describe('GET /v1/events', () => {
  it('needs a session and a known town', async () => {
    expect((await env.rt.app.request('/v1/events?town=phentanil')).status).toBe(401);
    expect((await env.rt.app.request('/v1/events?town=atlantis', { headers: { authorization: 'Bearer ' + player } })).status).toBe(404);
  });

  it('greets with the current revision and role', async () => {
    const s = await stream(player);
    expect(s.frames[0]).toEqual({ event: 'hello', data: { rev: await lastRev(), role: 'player', town: 'phentanil' } });
  });

  it('delivers an edit to players without the DM note, with the revision as id', async () => {
    const s = await stream(player);
    const r = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'Nou títol', note: 'NOVA-NOTA' } });
    const f = await s.waitFor((x) => x.event === 'change');
    expect(f.id).toBe(String(r.body.rev));
    expect(f.data.events).toEqual([{ type: 'quest.upserted', quest: expect.objectContaining({ id: 'q1', title: 'Nou títol', version: 2 }) }]);
    expect(JSON.stringify(f)).not.toContain('NOVA-NOTA');
  });

  it('tells players nothing about hidden quests but tells the DM everything', async () => {
    const p = await stream(player), d = await stream(dm);
    const r = await env.req('PATCH', '/v1/quests/q2', { token: dm, body: { title: 'ENCARA-OCULTA' } });
    const pf = await p.waitFor((x) => x.id === String(r.body.rev));
    const df = await d.waitFor((x) => x.id === String(r.body.rev));
    expect(pf.data.events).toEqual([]);
    expect(df.data.events[0].quest.title).toBe('ENCARA-OCULTA');
    expect(JSON.stringify(p.frames)).not.toContain('ENCARA-OCULTA');
  });

  it('turns a reveal into a new quest with its paper position, and a hide into a removal', async () => {
    const s = await stream(player);
    await env.req('POST', '/v1/quests/q2/reveal', { token: dm });
    const f = await s.waitFor((x) => x.event === 'change' && x.data.events.length > 0);
    expect(f.data.events).toEqual([
      { type: 'quest.upserted', quest: expect.objectContaining({ id: 'q2', hidden: false }) },
      { type: 'layout.changed', pieces: { q2: { cx: 900, cy: 400, r: 0, w: 285, h: 398, z: 42 } } }
    ]);
    expect(f.data.events[0].quest).not.toHaveProperty('note');
    await env.req('POST', '/v1/quests/q1/hide', { token: dm });
    const g = await s.waitFor((x) => x.data?.events?.some((e: any) => e.type === 'quest.removed'));
    expect(g.data.events).toEqual([{ type: 'quest.removed', id: 'q1' }, { type: 'tracked.changed', tracked: null }]);
  });

  it('only sends each board its own town', async () => {
    const cony = await stream(player, 'cony-cirera');
    const r1 = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'Només Phentanil' } });
    const r2 = await env.req('PATCH', '/v1/quests/q4', { token: dm, body: { title: 'Només Cony' } });
    await cony.waitFor((x) => x.id === String(r2.body.rev));
    expect(cony.frames.find((x) => x.id === String(r1.body.rev))!.data.events).toEqual([]);
    expect(cony.events()).toEqual([{ type: 'quest.upserted', quest: expect.objectContaining({ title: 'Només Cony' }) }]);
  });

  it('keeps order under many concurrent writes, with consecutive revisions', async () => {
    const s = await stream(dm);
    const start = await lastRev();
    await Promise.all(Array.from({ length: 25 }, (_, i) => env.req('PATCH', '/v1/quests/q1', { token: dm, body: { text: 'v' + i } })));
    await s.waitFor((x) => x.id === String(start + 25), 10_000);
    const ids = s.frames.filter((f) => f.event === 'change').map((f) => Number(f.id));
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => start + 1 + i));
    const versions = s.events().map((e: any) => e.quest.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
  });

  it('replays what a board missed after reconnecting', async () => {
    const from = await lastRev();
    await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'Mentre era fora' } });
    await env.req('PUT', '/v1/boards/phentanil/places/ajuntament', { token: dm, body: { text: 'Text nou' } });
    const s = await stream(player, 'phentanil', from);
    await s.waitFor((x) => x.id === String(from + 2));
    expect(s.events()).toEqual([
      { type: 'quest.upserted', quest: expect.objectContaining({ title: 'Mentre era fora' }) },
      { type: 'place.changed', place: 'ajuntament', text: 'Text nou' }
    ]);
    /* i després continua en directe */
    await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'En directe' } });
    await s.waitFor((x) => x.data?.events?.[0]?.quest?.title === 'En directe');
  });

  it('asks for a reload when the history it needs is gone, or the revision is from elsewhere', async () => {
    const from = await lastRev();
    await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'x' } });
    await env.rt.database.db.execute(sql`delete from changes`);
    const s = await stream(player, 'phentanil', from);
    expect((await s.waitFor((x) => x.event === 'change')).data.events).toEqual([{ type: 'board.reload' }]);
    const t = await stream(player, 'phentanil', 999_999);
    expect((await t.waitFor((x) => x.event === 'change')).data.events).toEqual([{ type: 'board.reload' }]);
  });

  it('asks every board to reload after a full import', async () => {
    const s = await stream(player);
    await env.req('POST', '/v1/import?mode=replace', { token: dm, body: { quests: [] } });
    expect((await s.waitFor((x) => x.event === 'change')).data.events).toEqual([{ type: 'board.reload' }]);
  });

  it('closes a session\'s streams when it loses or gains DM rights', async () => {
    const t = await env.login('dm');
    const s = await stream(t);
    await env.req('POST', '/v1/session/player', { token: t });
    await s.closed;
    const p = await stream(player);
    await env.req('POST', '/v1/session', { token: player, body: { role: 'dm', password: 'drac vermell' } });
    await p.closed;
  });

  it('picks up changes made by another process (the CLI)', async () => {
    const s = await stream(player);
    /* un canvi directe a la base de dades, sense avisar el hub: com el que fa la CLI */
    await mutate(env.rt.database.db, { role: 'dm', sessionId: null }, 'quest.update', (uow) => patchQuest(uow, 'q1', { title: 'Des de la CLI' }), () => 'cli');
    const f = await s.waitFor((x) => x.data?.events?.[0]?.quest?.title === 'Des de la CLI', 3000);
    expect(f.event).toBe('change');
  });

  it('forgets a board that disconnects', async () => {
    const s = await stream(player);
    expect(env.rt.hub.size).toBeGreaterThan(0);
    const n = env.rt.hub.size;
    s.close();
    await s.closed;
    await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'after' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(env.rt.hub.size).toBe(n - 1);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCampaign, setupEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
let dm: string;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.close(); });
beforeEach(async () => {
  await env.reset();
  dm = await env.login('dm');
  await seedCampaign(env, dm);
});

const history = async () => (await env.req('GET', '/v1/history', { token: dm })).body.changes;
const dmBoard = async () => (await env.req('GET', '/v1/boards/phentanil', { token: dm })).body;
const undo = (rev: number) => env.req('POST', `/v1/history/${rev}/undo`, { token: dm });

describe('history', () => {
  it('lists changes newest first with Catalan summaries', async () => {
    await env.req('POST', '/v1/quests/q1/complete', { token: dm });
    const h = await history();
    expect(h[0]).toMatchObject({ action: 'quest.complete', summary: 'Completada «La mina perduda»', role: 'dm', undoable: true });
    expect(h.map((c: any) => c.rev)).toEqual([...h.map((c: any) => c.rev)].sort((a: number, b: number) => b - a));
    expect(h.find((c: any) => c.action === 'quest.create').summary).toMatch(/^Nova missió «/);
    expect(h.find((c: any) => c.action === 'layout.update').summary).toBe('3 peces mogudes');
  });

  it('pages with before and limit', async () => {
    const all = await history();
    const page = (await env.req('GET', `/v1/history?before=${all[2].rev}&limit=2`, { token: dm })).body.changes;
    expect(page.map((c: any) => c.rev)).toEqual([all[3].rev, all[4].rev]);
  });
});

describe('undo', () => {
  it('reverts an edit and records the undo as a change of its own', async () => {
    const e = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'Canviat', text: 'Nou text' } });
    const u = await undo(e.body.rev);
    expect(u.status).toBe(200);
    const q = (await dmBoard()).quests.find((x: any) => x.id === 'q1');
    expect(q).toMatchObject({ title: 'La mina perduda', text: 'Trobar la mina' });
    expect(q.version).toBe(3);
    const h = await history();
    expect(h[0]).toMatchObject({ action: 'undo', summary: 'Canvi desfet', undoable: true });
    expect(h[1]).toMatchObject({ rev: e.body.rev, undoneBy: u.body.rev, undoable: false });
  });

  it('brings back a deleted quest with its papers and the tracked marker', async () => {
    const before = await dmBoard();
    const d = await env.req('DELETE', '/v1/quests/q1', { token: dm });
    await undo(d.body.rev);
    const after = await dmBoard();
    expect(after.quests).toEqual(before.quests.map((q: any) => (q.id === 'q1' ? { ...q, version: q.version + 1 } : q)));
    expect(after.layout).toEqual(before.layout);
    expect(after.tracked).toBe('q1');
  });

  it('removes a created quest', async () => {
    const c = await env.req('POST', '/v1/quests', { token: dm, body: { id: 'tmp', towns: { phentanil: null } } });
    await undo(c.body.rev);
    expect((await env.req('GET', '/v1/quests/tmp', { token: dm })).status).toBe(404);
  });

  it('refuses when the same thing changed afterwards', async () => {
    const a = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'A' } });
    await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'B' } });
    const r = await undo(a.body.rev);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('changed_since');
    expect((await dmBoard()).quests.find((x: any) => x.id === 'q1').title).toBe('B');
  });

  it('lets later unrelated changes stand', async () => {
    const a = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'A' } });
    await env.req('PATCH', '/v1/quests/q3', { token: dm, body: { title: 'Altres' } });
    expect((await undo(a.body.rev)).status).toBe(200);
    const qs = (await dmBoard()).quests;
    expect(qs.find((x: any) => x.id === 'q3').title).toBe('Altres');
  });

  it('can undo an undo, but not the same change twice', async () => {
    const a = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'A' } });
    const u = await undo(a.body.rev);
    expect((await undo(a.body.rev)).body.error.code).toBe('already_undone');
    await undo(u.body.rev);
    expect((await dmBoard()).quests.find((x: any) => x.id === 'q1').title).toBe('A');
  });

  it('undoes layout and place changes', async () => {
    const before = (await dmBoard()).layout;
    const l = await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { q1: null, map: { x: 0, y: 0, r: 0 } } } });
    const p = await env.req('PUT', '/v1/boards/phentanil/places/ajuntament', { token: dm, body: { text: 'x' } });
    await undo(p.body.rev);
    await undo(l.body.rev);
    const b = await dmBoard();
    expect(b.layout).toEqual(before);
    expect(b.places).toEqual({});
  });

  it('cannot undo imports or restores, and 404s unknown revisions', async () => {
    const i = await env.req('POST', '/v1/import?mode=replace', { token: dm, body: { quests: [] } });
    expect((await undo(i.body.rev)).body.error.code).toBe('not_undoable');
    expect((await undo(99999)).status).toBe(404);
    expect((await env.req('POST', '/v1/history/abc/undo', { token: dm })).status).toBe(400);
  });
});

describe('snapshots', () => {
  it('takes, lists and restores, keeping a copy of what it replaces', async () => {
    const s = await env.req('POST', '/v1/snapshots', { token: dm, body: { label: 'Abans de la sessió 12' } });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ reason: 'manual', label: 'Abans de la sessió 12' });
    const before = await dmBoard();
    await env.req('DELETE', '/v1/quests/q1', { token: dm });
    await env.req('PATCH', '/v1/quests/q3', { token: dm, body: { title: 'Trencat' } });
    const r = await env.req('POST', `/v1/snapshots/${s.body.id}/restore`, { token: dm });
    expect(r.status).toBe(200);
    const after = await dmBoard();
    expect(after.quests.map((q: any) => [q.id, q.title])).toEqual(before.quests.map((q: any) => [q.id, q.title]));
    expect(after.layout).toEqual(before.layout);
    expect(after.tracked).toBe('q1');
    const list = (await env.req('GET', '/v1/snapshots', { token: dm })).body.snapshots;
    expect(list.map((x: any) => x.reason)).toEqual(['pre-restore', 'manual']);
    expect((await history())[0]).toMatchObject({ action: 'snapshot.restore', undoable: false });
    expect((await env.req('POST', '/v1/snapshots/999/restore', { token: dm })).status).toBe(404);
  });
});

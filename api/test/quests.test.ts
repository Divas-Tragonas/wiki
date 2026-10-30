import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
let dm: string;
let player: string;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.close(); });
beforeEach(async () => {
  await env.reset();
  dm = await env.login('dm');
  player = await env.login('player');
});

const create = (body: Record<string, unknown> = {}) => env.req('POST', '/v1/quests', { token: dm, body: { towns: { phentanil: null }, ...body } });
const get = async (id: string) => (await env.req('GET', `/v1/quests/${id}`, { token: dm })).body.quest;

describe('creating quests', () => {
  it('starts hidden, with sensible defaults, and appends to the end', async () => {
    const a = await create({ title: 'A' });
    expect(a.status).toBe(201);
    expect(a.body.rev).toBe(1);
    expect(a.body.quest).toMatchObject({ title: 'A', cat: 'secundaria', hidden: true, status: 'active', version: 1, position: 0, note: '', special: null, steps: [] });
    expect(a.body.quest.id).toMatch(/^q[0-9a-z]{12}$/);
    const b = await create({ id: 'q-b', cat: 'principal', steps: [{ text: 'x' }, { id: 'st-1', text: 'y', done: true }] });
    expect(b.body.quest).toMatchObject({ id: 'q-b', position: 1 });
    expect(b.body.quest.steps.map((s: any) => [s.text, s.done])).toEqual([['x', false], ['y', true]]);
    expect(b.body.quest.steps[1].id).toBe('st-1');
  });

  it('rejects taken ids, reserved ids, unknown towns and places', async () => {
    await create({ id: 'dup' });
    expect((await create({ id: 'dup' })).body.error.code).toBe('quest_exists');
    expect((await create({ id: 'map' })).status).toBe(422);
    expect((await create({ towns: { atlantis: null } })).status).toBe(422);
    expect((await create({ towns: {} })).status).toBe(422);
    const r = await create({ towns: { phentanil: 'pou' } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('unknown_place');
    expect((await create({ towns: { phentanil: 'tauler' } })).body.error.code).toBe('unknown_place');
    expect((await create({ steps: [{ id: 's', text: 'a' }, { id: 's', text: 'b' }] })).body.error.code).toBe('step_exists');
  });

  it('keeps a deleted quest\'s id reserved so undo can bring it back', async () => {
    await create({ id: 'gone' });
    await env.req('DELETE', '/v1/quests/gone', { token: dm });
    expect((await create({ id: 'gone' })).body.error.code).toBe('quest_exists');
  });

  it('rejects unknown fields and oversized text', async () => {
    expect((await create({ version: 9 })).status).toBe(422);
    expect((await create({ title: 'x'.repeat(201) })).status).toBe(422);
  });
});

describe('editing quests', () => {
  it('patches fields and bumps the version and revision', async () => {
    await create({ id: 'q1', title: 'Old' });
    const r = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'New', note: 'n', cat: 'personal', who: 'Liriandor' } });
    expect(r.status).toBe(200);
    expect(r.body.rev).toBe(2);
    expect(r.body.quest).toMatchObject({ title: 'New', note: 'n', cat: 'personal', who: 'Liriandor', version: 2 });
  });

  it('does nothing (same revision and version) when nothing changes', async () => {
    await create({ id: 'q1', title: 'Same' });
    const r = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'Same' } });
    expect(r.body.rev).toBe(1);
    expect(r.body.quest.version).toBe(1);
    expect((await env.req('GET', '/v1/history', { token: dm })).body.changes).toHaveLength(1);
  });

  it('refuses a stale If-Match and returns the current quest', async () => {
    await create({ id: 'q1' });
    await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'From the laptop' } });
    const r = await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'From the tablet' }, headers: { 'if-match': '1' } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'version_mismatch', details: { quest: { title: 'From the laptop', version: 2 } } });
    expect((await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'ok' }, headers: { 'if-match': '"2"' } })).status).toBe(200);
    expect((await env.req('PATCH', '/v1/quests/q1', { token: dm, body: { title: 'ok' }, headers: { 'if-match': 'abc' } })).status).toBe(400);
  });

  it('answers 404 for unknown quests', async () => {
    expect((await env.req('PATCH', '/v1/quests/nope', { token: dm, body: { title: 'x' } })).status).toBe(404);
    expect((await env.req('POST', '/v1/quests/nope/complete', { token: dm })).status).toBe(404);
    expect((await env.req('DELETE', '/v1/quests/nope', { token: dm })).status).toBe(404);
    expect((await env.req('GET', '/v1/quests/nope', { token: dm })).status).toBe(404);
  });
});

describe('quest state', () => {
  beforeEach(async () => {
    await create({ id: 'q1', hidden: false });
    await env.req('PUT', '/v1/tracked', { token: dm, body: { questId: 'q1' } });
  });

  it('completes (stamping the time and unfollowing) and reopens', async () => {
    const r = await env.req('POST', '/v1/quests/q1/complete', { token: dm });
    expect(r.body.quest).toMatchObject({ status: 'done', doneAt: env.clock.now.getTime() });
    expect((await env.req('GET', '/v1/boards/phentanil', { token: dm })).body.tracked).toBeNull();
    /* completar-la un altre cop no canvia res */
    expect((await env.req('POST', '/v1/quests/q1/complete', { token: dm })).body.rev).toBe(r.body.rev);
    const o = await env.req('POST', '/v1/quests/q1/reopen', { token: dm });
    expect(o.body.quest).toMatchObject({ status: 'active', doneAt: null });
  });

  it('hides (unfollowing) and reveals', async () => {
    expect((await env.req('POST', '/v1/quests/q1/hide', { token: dm })).body.quest.hidden).toBe(true);
    expect((await env.req('GET', '/v1/boards/phentanil', { token: dm })).body.tracked).toBeNull();
    expect((await env.req('GET', '/v1/quests/q1', { token: player })).status).toBe(404);
    expect((await env.req('POST', '/v1/quests/q1/reveal', { token: dm })).body.quest.hidden).toBe(false);
    expect((await env.req('GET', '/v1/quests/q1', { token: player })).status).toBe(200);
  });

  it('deletes, unfollowing it and removing its papers from every board', async () => {
    await env.req('PUT', '/v1/quests/q1/towns/cony-cirera', { token: dm, body: { place: null } });
    await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { q1: { cx: 1, cy: 1, r: 0 } } } });
    await env.req('PATCH', '/v1/boards/cony-cirera/layout', { token: dm, body: { pieces: { q1: { cx: 2, cy: 2, r: 0 } } } });
    expect((await env.req('DELETE', '/v1/quests/q1', { token: dm })).status).toBe(200);
    const board = (await env.req('GET', '/v1/boards/phentanil', { token: dm })).body;
    expect(board.quests).toEqual([]);
    expect(board.tracked).toBeNull();
    expect(board.layout).toEqual({});
    expect((await env.req('GET', '/v1/boards/cony-cirera', { token: dm })).body.layout).toEqual({});
  });

  it('only follows quests that exist', async () => {
    expect((await env.req('PUT', '/v1/tracked', { token: dm, body: { questId: 'nope' } })).status).toBe(404);
    expect((await env.req('PUT', '/v1/tracked', { token: dm, body: { questId: null } })).body.tracked).toBeNull();
  });
});

describe('boards a quest is on', () => {
  it('links with a place, moves the place, and unlinks', async () => {
    await create({ id: 'q1' });
    let r = await env.req('PUT', '/v1/quests/q1/towns/cony-cirera', { token: dm, body: { place: 'pou' } });
    expect(r.body.quest.towns).toEqual({ phentanil: null, 'cony-cirera': 'pou' });
    r = await env.req('PUT', '/v1/quests/q1/towns/phentanil', { token: dm, body: { place: 'ferreria' } });
    expect(r.body.quest.towns.phentanil).toBe('ferreria');
    expect((await env.req('PUT', '/v1/quests/q1/towns/phentanil', { token: dm, body: { place: 'pou' } })).body.error.code).toBe('unknown_place');
    expect((await env.req('PUT', '/v1/quests/q1/towns/atlantis', { token: dm, body: { place: null } })).status).toBe(404);
    await env.req('PATCH', '/v1/boards/cony-cirera/layout', { token: dm, body: { pieces: { q1: { cx: 2, cy: 2, r: 0 } } } });
    r = await env.req('DELETE', '/v1/quests/q1/towns/cony-cirera', { token: dm });
    expect(r.body.quest.towns).toEqual({ phentanil: 'ferreria' });
    expect((await env.req('GET', '/v1/boards/cony-cirera', { token: dm })).body.layout).toEqual({});
  });

  it('never leaves a quest without a board', async () => {
    await create({ id: 'q1' });
    const r = await env.req('DELETE', '/v1/quests/q1/towns/phentanil', { token: dm });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('last_town');
    /* treure'l d'un tauler on no és no fa res */
    expect((await env.req('DELETE', '/v1/quests/q1/towns/cony-cirera', { token: dm })).status).toBe(200);
  });
});

describe('objectives', () => {
  beforeEach(async () => {
    await create({ id: 'q1', steps: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] });
  });
  const ids = async () => (await get('q1')).steps.map((s: any) => s.id);

  it('adds at the end, after another, or at the start', async () => {
    const r = await env.req('POST', '/v1/quests/q1/steps', { token: dm, body: { text: 'C' } });
    expect(r.status).toBe(201);
    expect(r.body.step).toMatchObject({ text: 'C', done: false });
    await env.req('POST', '/v1/quests/q1/steps', { token: dm, body: { id: 'x', after: 'a' } });
    await env.req('POST', '/v1/quests/q1/steps', { token: dm, body: { id: 'first', after: null } });
    expect(await ids()).toEqual(['first', 'a', 'x', 'b', r.body.step.id]);
    expect((await env.req('POST', '/v1/quests/q1/steps', { token: dm, body: { after: 'nope' } })).status).toBe(404);
    expect((await env.req('POST', '/v1/quests/q1/steps', { token: dm, body: { id: 'a' } })).body.error.code).toBe('step_exists');
  });

  it('refuses an objective id used by another quest', async () => {
    await create({ id: 'q2', steps: [{ id: 'shared', text: '' }] });
    expect((await env.req('POST', '/v1/quests/q1/steps', { token: dm, body: { id: 'shared' } })).body.error.code).toBe('step_exists');
  });

  it('edits, ticks, removes and reorders', async () => {
    await env.req('PATCH', '/v1/quests/q1/steps/a', { token: dm, body: { text: 'A!', done: true } });
    expect((await get('q1')).steps[0]).toEqual({ id: 'a', text: 'A!', done: true });
    expect((await env.req('PATCH', '/v1/quests/q1/steps/zz', { token: dm, body: { done: true } })).status).toBe(404);
    await env.req('PUT', '/v1/quests/q1/steps/order', { token: dm, body: { ids: ['b', 'a'] } });
    expect(await ids()).toEqual(['b', 'a']);
    expect((await env.req('PUT', '/v1/quests/q1/steps/order', { token: dm, body: { ids: ['b'] } })).body.error.code).toBe('bad_order');
    expect((await env.req('PUT', '/v1/quests/q1/steps/order', { token: dm, body: { ids: ['b', 'b'] } })).body.error.code).toBe('bad_order');
    await env.req('DELETE', '/v1/quests/q1/steps/b', { token: dm });
    expect(await ids()).toEqual(['a']);
    expect((await env.req('DELETE', '/v1/quests/q1/steps/b', { token: dm })).status).toBe(404);
  });
});

describe('who may write', () => {
  it('rejects every write from a player', async () => {
    await create({ id: 'q1', hidden: false, steps: [{ id: 'a', text: '' }] });
    await env.req('POST', '/v1/ecos', { token: dm, body: { id: 'e1' } });
    const writes: [string, string, unknown?][] = [
      ['POST', '/v1/quests', { towns: { phentanil: null } }],
      ['PATCH', '/v1/quests/q1', { title: 'x' }],
      ['POST', '/v1/quests/q1/complete'],
      ['POST', '/v1/quests/q1/hide'],
      ['DELETE', '/v1/quests/q1'],
      ['PUT', '/v1/quests/q1/towns/cony-cirera', { place: null }],
      ['DELETE', '/v1/quests/q1/towns/phentanil'],
      ['POST', '/v1/quests/q1/steps', { text: 'x' }],
      ['PATCH', '/v1/quests/q1/steps/a', { done: true }],
      ['DELETE', '/v1/quests/q1/steps/a'],
      ['PUT', '/v1/quests/q1/steps/order', { ids: ['a'] }],
      ['PUT', '/v1/tracked', { questId: null }],
      ['PATCH', '/v1/party', { level: 3 }],
      ['POST', '/v1/ecos', {}],
      ['PATCH', '/v1/ecos/e1', { unlocked: true }],
      ['DELETE', '/v1/ecos/e1'],
      ['PUT', '/v1/boards/phentanil/places/ajuntament', { text: 'x' }],
      ['DELETE', '/v1/boards/phentanil/places/ajuntament'],
      ['PATCH', '/v1/boards/phentanil/layout', { pieces: {} }],
      ['GET', '/v1/export'],
      ['POST', '/v1/import?mode=replace', { quests: [] }],
      ['GET', '/v1/history'],
      ['POST', '/v1/history/1/undo'],
      ['GET', '/v1/snapshots'],
      ['POST', '/v1/snapshots', {}],
      ['POST', '/v1/snapshots/1/restore'],
      ['GET', '/v1/sessions']
    ];
    for (const [m, p, b] of writes) {
      const r = await env.req(m, p, { token: player, body: b });
      expect([m, p, r.status]).toEqual([m, p, 403]);
      expect((await env.req(m, p, { body: b })).status).toBe(401);
    }
    expect((await get('q1')).title).toBe('');
  });
});

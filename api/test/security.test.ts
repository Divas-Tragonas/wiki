/* Que cap jugador vegi mai res del DM: ni per una ruta de lectura ni pel canal d'esdeveniments, al llarg d'una sessió
   de joc sencera amb tota mena de canvis. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openStream, SECRETS, seedCampaign, setupEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.close(); });

describe('players never see DM secrets', () => {
  it('through any read or any event during a whole session', async () => {
    await env.reset();
    const dm = await env.login('dm');
    const player = await env.login('player');
    await seedCampaign(env, dm);
    const streams = [await openStream(env, player, 'phentanil'), await openStream(env, player, 'cony-cirera')];
    const seen: string[] = [];
    const readAll = async () => {
      for (const p of ['/v1/towns', '/v1/boards/phentanil', '/v1/boards/cony-cirera', '/v1/quests/q1', '/v1/quests/q2', '/v1/quests/q3', '/v1/session']) {
        seen.push(JSON.stringify((await env.req('GET', p, { token: player })).body));
      }
    };
    const D = (m: string, p: string, body?: unknown) => env.req(m, p, { token: dm, body });

    await readAll();
    await D('PATCH', '/v1/quests/q2', { title: 'MISSIO-OCULTA v2', note: 'NOTA-SECRETA-2 v2' });
    await D('POST', '/v1/quests/q2/steps', { text: 'MISSIO-OCULTA pas' });
    await D('PUT', '/v1/quests/q2/towns/cony-cirera', { place: 'pou' });
    await D('PATCH', '/v1/boards/phentanil/layout', { pieces: { q2: { cx: 1, cy: 1, r: 0 } } });
    await D('PATCH', '/v1/boards/cony-cirera/layout', { pieces: { q2: { cx: 2, cy: 2, r: 0 } } });
    await D('PATCH', '/v1/ecos/e2', { title: 'ECO-BLOQUEJAT v2' });
    await D('PATCH', '/v1/quests/q1', { note: 'NOTA-SECRETA-1 v2' });
    await D('POST', '/v1/quests', { id: 'secret-new', title: 'MISSIO-OCULTA nova', note: 'NOTA-SECRETA-1', towns: { phentanil: 'ferreria' } });
    await readAll();
    /* es revela, s'hi treballa i es torna a amagar: mentre és visible els jugadors la veuen, però mai la nota */
    await D('POST', '/v1/quests/q3/hide');
    await D('PATCH', '/v1/quests/q3', { note: 'NOTA-SECRETA-2 q3' });
    await D('POST', '/v1/quests/q3/reveal');
    await D('POST', '/v1/quests/q3/complete');
    const del = await D('DELETE', '/v1/quests/q3');
    await D('POST', `/v1/history/${del.body.rev}/undo`);
    await D('PUT', '/v1/tracked', { questId: 'q2' });
    await readAll();
    const exp = (await D('GET', '/v1/export')).body;
    await D('POST', '/v1/import?mode=merge&town=cony-cirera', { quests: [{ id: 'imp', title: 'MISSIO-OCULTA importada', hidden: true, note: 'NOTA-SECRETA-1' }] });
    await D('POST', '/v1/import?mode=replace', exp);
    await readAll();

    const last = (await env.req('GET', '/v1/boards/phentanil', { token: dm })).body.rev;
    for (const s of streams) await s.waitFor((f) => f.id === String(last), 5000);
    for (const s of streams) seen.push(JSON.stringify(s.frames));
    for (const s of streams) s.close();

    const all = seen.join('\n');
    for (const secret of SECRETS) expect(all.includes(secret), `players saw ${secret}`).toBe(false);
    expect(all).not.toContain('secret-new');
    expect(all).not.toContain('"note"');
    /* i sí que van veure el que és seu */
    expect(all).toContain('La mina perduda');
    expect(all).toContain('board.reload');
  });
});

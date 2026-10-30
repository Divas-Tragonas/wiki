import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decryptLegacyDataJson } from '../src/services/transfer.ts';
import { seedCampaign, setupEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
let dm: string;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.close(); });
beforeEach(async () => {
  await env.reset();
  dm = await env.login('dm');
});

const dmBoard = async (town = 'phentanil') => (await env.req('GET', `/v1/boards/${town}`, { token: dm })).body;

describe('export and full import', () => {
  it('round-trips the whole campaign exactly', async () => {
    await seedCampaign(env, dm);
    await env.req('PUT', '/v1/boards/cony-cirera/places/pou', { token: dm, body: { text: 'Aigua freda' } });
    await env.req('POST', '/v1/quests/q3/complete', { token: dm });
    const exp = await env.req('GET', '/v1/export', { token: dm });
    expect(exp.status).toBe(200);
    expect(exp.headers.get('content-disposition')).toMatch(/missions-\d{4}-\d{2}-\d{2}\.json/);
    expect(exp.body).toMatchObject({ format: 'mina-missions', tracked: 'q1' });
    /* el format és el d'abans: towns com a llista, at, steps amb t i d */
    expect(exp.body.quests[0]).toMatchObject({ id: 'q1', towns: ['phentanil'], at: { phentanil: 'ajuntament' }, steps: [{ id: 's1', t: 'Parlar amb Sildar', d: true }, { id: 's2', t: 'Trobar el mapa', d: false }] });
    const before = [await dmBoard(), await dmBoard('cony-cirera')];
    await env.reset();
    dm = await env.login('dm');
    const imp = await env.req('POST', '/v1/import?mode=replace', { token: dm, body: exp.body });
    expect(imp.body).toMatchObject({ quests: 4, ecos: 2, skipped: [] });
    const after = [await dmBoard(), await dmBoard('cony-cirera')];
    const strip = (b: any) => ({ ...b, rev: 0, quests: b.quests.map((q: any) => ({ ...q, version: 0 })) });
    expect(after.map(strip)).toEqual(before.map(strip));
  });

  it('imports an old board export and keeps a snapshot of what was there', async () => {
    await seedCampaign(env, dm);
    const old = {
      quests: [{ id: 'old1', cat: 'principal', title: 'Antiga', steps: [{ t: 'x', d: false }], status: 'active', hidden: false, place: 'ferreria' }],
      ecos: [],
      layout: { map: { x: 1, y: 2, r: 0 } },
      places: { ferreria: { text: 'Fum' } },
      tracked: 'old1'
    };
    await env.req('POST', '/v1/import?mode=replace', { token: dm, body: old });
    const b = await dmBoard();
    expect(b.quests.map((q: any) => [q.id, q.towns])).toEqual([['old1', { phentanil: 'ferreria' }]]);
    expect(b.layout).toEqual({ map: { x: 1, y: 2, r: 0 } });
    expect(b.places).toEqual({ ferreria: 'Fum' });
    expect(b.tracked).toBe('old1');
    const snaps = (await env.req('GET', '/v1/snapshots', { token: dm })).body.snapshots;
    expect(snaps[0].reason).toBe('pre-import');
    await env.req('POST', `/v1/snapshots/${snaps[0].id}/restore`, { token: dm });
    expect((await dmBoard()).quests.map((q: any) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('rejects files that are not boards and bad modes', async () => {
    expect((await env.req('POST', '/v1/import?mode=replace', { token: dm, body: { hello: 1 } })).body.error.code).toBe('bad_import');
    expect((await env.req('POST', '/v1/import?mode=replace', { token: dm, raw: 'nope' })).status).toBe(400);
    expect((await env.req('POST', '/v1/import?mode=wipe', { token: dm, body: { quests: [] } })).status).toBe(400);
    expect((await env.req('POST', '/v1/import?mode=merge&town=atlantis', { token: dm, body: { quests: [] } })).status).toBe(404);
  });

  it('refuses huge uploads', async () => {
    const big = JSON.stringify({ quests: [], pad: 'x'.repeat(6 * 1024 * 1024) });
    expect((await env.req('POST', '/v1/import?mode=replace', { token: dm, raw: big })).status).toBe(413);
    expect((await env.req('PATCH', '/v1/party', { token: dm, raw: JSON.stringify({ title: 'x'.repeat(300 * 1024) }) })).status).toBe(413);
  });
});

describe('merging one town\'s file', () => {
  beforeEach(async () => { await seedCampaign(env, dm); });

  it('links existing quests by id or title and adds the rest', async () => {
    const file = {
      board: 'cony-cirera',
      quests: [
        { id: 'q1', title: 'Whatever', at: { 'cony-cirera': 'capella' }, note: 'De Cony' },
        { id: 'x9', title: '  la MINA perduda!  ', note: 'De Cony' },
        { id: 'new1', title: 'Nova de Cony', place: 'farga', steps: [{ t: 'a' }] },
        { id: 'q2', title: 'collides with hidden id' }
      ],
      places: { pou: { text: 'Pou de Cony' }, ajuntament: { text: 'ignored: not on this map' } },
      tracked: 'new1'
    };
    const r = await env.req('POST', '/v1/import?mode=merge&town=cony-cirera', { token: dm, body: file });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ added: 1, linked: 3 });
    const b = await dmBoard('cony-cirera');
    const q1 = b.quests.find((q: any) => q.id === 'q1');
    expect(q1.towns).toEqual({ phentanil: 'ajuntament', 'cony-cirera': 'capella' });
    expect(q1.note).toBe('NOTA-SECRETA-1\n\nDe Cony');
    const added = b.quests.find((q: any) => q.title === 'Nova de Cony');
    expect(added).toMatchObject({ id: 'new1', towns: { 'cony-cirera': 'farga' } });
    expect(b.places).toEqual({ pou: 'Pou de Cony' });
    /* ja hi havia una missió seguida */
    expect(b.tracked).toBe('q1');
    /* tornar-lo a importar no duplica res */
    const again = await env.req('POST', '/v1/import?mode=merge&town=cony-cirera', { token: dm, body: file });
    expect(again.body).toMatchObject({ added: 0, linked: 4 });
    expect((await dmBoard('cony-cirera')).quests).toHaveLength(b.quests.length);
  });

  it('gives a new id to a quest whose id was used by a deleted one, and can be undone', async () => {
    await env.req('DELETE', '/v1/quests/q3', { token: dm });
    const r = await env.req('POST', '/v1/import?mode=merge&town=phentanil', { token: dm, body: { quests: [{ id: 'q3', title: 'Una altra' }] } });
    const qs = (await dmBoard()).quests;
    const added = qs.find((q: any) => q.title === 'Una altra');
    expect(added.id).not.toBe('q3');
    await env.req('POST', `/v1/history/${r.body.rev}/undo`, { token: dm });
    expect((await dmBoard()).quests.find((q: any) => q.title === 'Una altra')).toBeUndefined();
  });
});

/* el mateix xifratge que feia el tauler abans de l'API */
async function encryptLikeTheOldBoard(state: unknown, dmPassword: string) {
  const enc = new TextEncoder();
  const sd = webcrypto.getRandomValues(new Uint8Array(16));
  const base = await webcrypto.subtle.importKey('raw', enc.encode(dmPassword.trim().toLowerCase().replace(/\s+/g, ' ')), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: sd, iterations: 2000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(state))));
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
  return { v: 1, rev: 3, kdf: { alg: 'PBKDF2-SHA256/AES-GCM', iter: 2000, sp: b64(sd), sd: b64(sd) }, pub: { iv: '', ct: '' }, dm: { iv: b64(iv), ct: b64(ct) } };
}

describe('the old encrypted data.json', () => {
  const state = { quests: [{ id: 'q1', title: 'Secreta', hidden: true, note: 'n', towns: ['phentanil'], at: {} }], ecos: [], boards: {} };

  it('decrypts with the DM password, ignoring case and spaces', async () => {
    const file = await encryptLikeTheOldBoard(state, 'Drac Vermell');
    expect(await decryptLegacyDataJson(file, '  drac   VERMELL ')).toEqual(state);
    await expect(decryptLegacyDataJson(file, 'drac blau')).rejects.toThrow('no obre');
    await expect(decryptLegacyDataJson({ nope: 1 }, 'x')).rejects.toThrow('no és un data.json');
  });

  it('imports through the CLI, and the CLI manages passwords, exports and snapshots', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mina-cli-'));
    try {
      const run = promisify(execFile);
      const cli = (args: string[], extra: Record<string, string> = {}) =>
        run(process.execPath, ['--experimental-strip-types', '--no-warnings', 'src/cli.ts', ...args], {
          env: { ...process.env, DATABASE_URL: 'pglite://' + join(dir, 'db'), ...extra }
        });
      writeFileSync(join(dir, 'data.json'), JSON.stringify(await encryptLikeTheOldBoard(state, 'Drac')));
      await expect(cli(['import-data-json', join(dir, 'data.json')], { DM_PASSWORD: 'wrong' })).rejects.toMatchObject({ stderr: expect.stringContaining('no obre') });
      const dry = await cli(['import-data-json', join(dir, 'data.json'), '--dry-run'], { DM_PASSWORD: 'drac' });
      expect(dry.stdout).toContain('Missions: 1 (1 ocultes, 0 completades, 0 objectius)');
      expect(dry.stdout).toContain('no s’ha tocat la base de dades');
      expect((await cli(['status'])).stdout).toContain('Missions: 0');
      const imp = await cli(['import-data-json', join(dir, 'data.json')], { DM_PASSWORD: 'drac' });
      expect(imp.stdout).toContain('Importat (revisió 1)');
      expect(imp.stdout).toContain('phentanil: 1 missions');
      /* un segon cop no trepitja el que ja hi ha, si no es diu --force */
      const again = await cli(['import-data-json', join(dir, 'data.json')], { DM_PASSWORD: 'drac' }).catch((e) => e);
      expect(again.stderr).toContain('ja té 1 missions');
      expect((await cli(['import-data-json', join(dir, 'data.json'), '--force'], { DM_PASSWORD: 'drac' })).stdout).toContain('Importat (revisió 2)');
      await cli(['set-password', 'player'], { PASSWORD: 'grup nou' });
      expect((await cli(['set-password', 'dm'], { PASSWORD: 'abc' }).catch((e) => e)).stderr).toContain('mínim 4');
      const st = await cli(['status']);
      expect(st.stdout).toContain('Missions: 1 (1 ocultes, 0 completades)');
      expect(st.stdout).toContain('Contrasenya player: posada');
      expect(st.stdout).toContain('Contrasenya dm: FALTA');
      await cli(['export', join(dir, 'out.json')]);
      expect(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')).quests[0]).toMatchObject({ id: 'q1', title: 'Secreta', hidden: true, note: 'n' });
      expect((await cli(['snapshot', 'prova'])).stdout).toMatch(/Còpia \d+/);
      expect((await cli(['nightly'])).stdout).toMatch(/Còpia \d+\. Esborrades: 0 còpies velles/);
      expect((await cli(['help'])).stdout).toContain('set-password');
      await expect(cli(['bogus'])).rejects.toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

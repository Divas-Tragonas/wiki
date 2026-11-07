/* Entorn de proves: una base de dades nova per fitxer de tests (PGlite en memòria, o una base de dades temporal a
   Postgres si hi ha TEST_DATABASE_URL), un rellotge controlable i ajudes per fer peticions i llegir esdeveniments. */
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import type { BoardEvent, Role } from '@mina/model';
import { hashPassword } from '../src/auth/passwords.ts';
import { setPasswordHash } from '../src/auth/sessions.ts';
import { loadConfig } from '../src/config.ts';
import { startRuntime, type Runtime } from '../src/runtime.ts';
import * as repo from '../src/store/repo.ts';

/* el tauler s'obre sense contrasenya: només n'hi ha per al DM */
export const PASSWORDS = { dm: 'drac vermell' } as const;

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export interface TestEnv {
  rt: Runtime;
  clock: { now: Date; advance: (ms: number) => void };
  req: <T = any>(method: string, path: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string }) => Promise<Res<T>>;
  login: (role: Role, opts?: { token?: string; label?: string }) => Promise<string>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

async function tempPostgres(base: string): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = 'mina_t_' + randomBytes(6).toString('hex');
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const u = new URL(base);
  u.pathname = '/' + name;
  return {
    url: u.toString(),
    drop: async () => {
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    }
  };
}

export async function setupEnv(opts: { watchMs?: number | null; origins?: string } = {}): Promise<TestEnv> {
  const pg = process.env.TEST_DATABASE_URL ? await tempPostgres(process.env.TEST_DATABASE_URL) : null;
  const clock = {
    now: new Date('2026-06-01T10:00:00Z'),
    advance(ms: number) {
      this.now = new Date(this.now.getTime() + ms);
    }
  };
  const config = loadConfig({
    DATABASE_URL: pg ? pg.url : 'pglite://memory',
    ALLOWED_ORIGINS: opts.origins ?? 'https://wiki.example',
    LOG_REQUESTS: '0',
    PING_INTERVAL_MS: '60000'
  });
  const rt = await startRuntime(config, { now: () => clock.now, watchMs: opts.watchMs ?? null });
  const db = rt.database.db;
  const dmHash = await hashPassword(PASSWORDS.dm);

  const setPasswords = () => setPasswordHash(db, 'dm', dmHash, clock.now);
  await setPasswords();

  const req: TestEnv['req'] = async (method, path, o = {}) => {
    const headers: Record<string, string> = { ...(o.headers || {}) };
    if (o.token) headers.authorization = 'Bearer ' + o.token;
    let bodyInit: string | undefined;
    if (o.raw !== undefined) bodyInit = o.raw;
    else if (o.body !== undefined) bodyInit = JSON.stringify(o.body);
    if (bodyInit !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    const res = await rt.app.request(path, { method, headers, body: bodyInit });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* no és JSON */
    }
    return { status: res.status, body: parsed as never, headers: res.headers };
  };

  const login: TestEnv['login'] = async (role, o = {}) => {
    const r = await req('POST', '/v1/session', { body: { role, password: role === 'dm' ? PASSWORDS.dm : undefined, label: o.label }, token: o.token });
    if (r.status !== 200 && r.status !== 201) throw new Error(`login ${role}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.token ?? o.token;
  };

  const reset = async () => {
    await db.execute(sql`truncate quest_steps, quest_towns, quests, ecos, board_places, board_layout, changes, snapshots, sessions restart identity cascade`);
    await db.execute(sql`update campaign set rev = 0, tracked_quest_id = null, party_level = 1, party_title = ''`);
    await repo.ensureSeed(db);
    await setPasswords();
    rt.hub.reset(0);
    rt.loginLimiter.clear();
    clock.now = new Date('2026-06-01T10:00:00Z');
  };

  return {
    rt, clock, req, login, reset,
    close: async () => {
      await rt.close();
      if (pg) await pg.drop();
    }
  };
}

/* ---------- canal d'esdeveniments ---------- */
export interface Frame {
  event: string;
  id?: string;
  data: any;
}

export interface Stream {
  frames: Frame[];
  /* espera fins que hi hagi un frame que compleixi la condició (o falla al cap de `ms`) */
  waitFor: (pred: (f: Frame) => boolean, ms?: number) => Promise<Frame>;
  /* tots els esdeveniments rebuts fins ara, en ordre */
  events: () => BoardEvent[];
  closed: Promise<void>;
  close: () => void;
}

export async function openStream(env: TestEnv, token: string, town = 'phentanil', lastEventId?: number): Promise<Stream> {
  const ctl = new AbortController();
  const headers: Record<string, string> = { authorization: 'Bearer ' + token };
  if (lastEventId !== undefined) headers['last-event-id'] = String(lastEventId);
  const res = await env.rt.app.request(`/v1/events?town=${town}`, { headers, signal: ctl.signal });
  if (res.status !== 200 || !res.body) throw new Error(`stream ${res.status}: ${await res.text()}`);
  const frames: Frame[] = [];
  const waiters: (() => void)[] = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const closed = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (block.startsWith(':')) continue;
          const f: Frame = { event: 'message', data: null };
          const data: string[] = [];
          for (const line of block.split('\n')) {
            const k = line.slice(0, line.indexOf(':')), v = line.slice(line.indexOf(':') + 1).replace(/^ /, '');
            if (k === 'event') f.event = v;
            else if (k === 'id') f.id = v;
            else if (k === 'data') data.push(v);
          }
          f.data = data.length ? JSON.parse(data.join('\n')) : null;
          frames.push(f);
          waiters.splice(0).forEach((w) => w());
        }
      }
    } catch {
      /* tancat */
    } finally {
      waiters.splice(0).forEach((w) => w());
    }
  })();
  let ended = false;
  void closed.then(() => (ended = true));
  const waitFor: Stream['waitFor'] = (pred, ms = 3000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for frame; got ' + JSON.stringify(frames))), ms);
      const check = () => {
        const f = frames.find(pred);
        if (f) {
          clearTimeout(t);
          resolve(f);
        } else if (ended) {
          clearTimeout(t);
          reject(new Error('stream closed; got ' + JSON.stringify(frames)));
        } else waiters.push(check);
      };
      check();
    });
  await waitFor((f) => f.event === 'hello');
  return {
    frames,
    waitFor,
    events: () => frames.filter((f) => f.event === 'change').flatMap((f) => f.data.events),
    closed,
    /* com quan el navegador tanca la connexió: es cancel·la la lectura */
    close: () => {
      ctl.abort();
      reader.cancel().catch(() => {});
    }
  };
}

/* una campanya petita amb de tot: visibles, ocultes, completades, dos pobles, ecos i peces col·locades */
export async function seedCampaign(env: TestEnv, dm: string) {
  const q = (body: unknown) => env.req('POST', '/v1/quests', { token: dm, body });
  await q({ id: 'q1', cat: 'principal', title: 'La mina perduda', text: 'Trobar la mina', giver: 'Sildar', hidden: false, towns: { phentanil: 'ajuntament' }, note: 'NOTA-SECRETA-1', steps: [{ id: 's1', text: 'Parlar amb Sildar', done: true }, { id: 's2', text: 'Trobar el mapa' }] });
  await q({ id: 'q2', title: 'MISSIO-OCULTA', hidden: true, towns: { phentanil: 'ferreria' }, note: 'NOTA-SECRETA-2' });
  await q({ id: 'q3', title: 'Llops al bosc', reward: '50 po', hidden: false, towns: { phentanil: 'hort-damia', 'cony-cirera': 'pou' } });
  await q({ id: 'q4', title: 'Avís de Cony Cirera', hidden: false, towns: { 'cony-cirera': 'capella' } });
  await env.req('POST', '/v1/ecos', { token: dm, body: { id: 'e1', num: 1, title: 'Primer eco', text: 'Una veu', unlocked: true } });
  await env.req('POST', '/v1/ecos', { token: dm, body: { id: 'e2', num: 2, title: 'ECO-BLOQUEJAT', text: 'TEXT-ECO-BLOQUEJAT', unlocked: false } });
  await env.req('PATCH', '/v1/boards/phentanil/layout', { token: dm, body: { pieces: { map: { x: 40, y: 30, r: -1 }, q1: { cx: 500, cy: 500, r: 2, w: 285, h: 398, z: 41 }, q2: { cx: 900, cy: 400, r: 0, w: 285, h: 398, z: 42 } } } });
  await env.req('PUT', '/v1/tracked', { token: dm, body: { questId: 'q1' } });
}

export const SECRETS = ['NOTA-SECRETA-1', 'NOTA-SECRETA-2', 'MISSIO-OCULTA', 'ECO-BLOQUEJAT', 'TEXT-ECO-BLOQUEJAT', '"q2"'];

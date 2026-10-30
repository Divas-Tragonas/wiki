/* El que comparteixen totes les rutes: dependències, sessió de la petició i ajudes per validar i fer canvis. */
import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import type { ChangeItem } from '@mina/model';
import type { RateLimiter } from '../auth/ratelimit.ts';
import { resolveSession, type SessionInfo } from '../auth/sessions.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { ApiError } from '../errors.ts';
import type { Hub } from '../realtime/hub.ts';
import { describe } from '../services/summaries.ts';
import { mutate, type UnitOfWork } from '../store/uow.ts';

export interface Deps {
  db: Db;
  hub: Hub;
  config: Config;
  now: () => Date;
  loginLimiter: RateLimiter;
}

export type AppEnv = { Variables: { session: SessionInfo; deps: Deps } };
export type Ctx = Context<AppEnv>;

export const bearer = (c: Context) => {
  const h = c.req.header('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
};

/* cal una sessió (de jugador o de DM) */
export const authed: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { db, now } = c.get('deps');
  const token = bearer(c);
  const session = token ? await resolveSession(db, token, now()) : null;
  if (!session) throw new ApiError(401, 'unauthorized', 'Cal entrar amb la contrasenya del grup');
  c.set('session', session);
  await next();
};

export const dmOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('session').role !== 'dm') throw new ApiError(403, 'dm_only', 'Només el DM pot fer això');
  await next();
};

/* les dues coses: sessió i permís de DM. Les rutes porten el seu middleware (un `use` d'un subgrup muntat a /v1
   s'aplicaria a totes les rutes de /v1) */
export const dmAuthed: MiddlewareHandler<AppEnv> = (c, next) =>
  authed(c, async () => {
    await dmOnly(c, next);
  });

export async function body<S extends z.ZodType>(c: Ctx, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_json', 'El cos de la petició no és JSON');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(422, 'invalid_body', 'Dades no vàlides', r.error.issues);
  return r.data;
}

export async function rawJson(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_json', 'El cos de la petició no és JSON');
  }
}

/* If-Match: la versió de la missió que el tauler creu que modifica */
export function ifMatch(c: Ctx): number | undefined {
  const h = c.req.header('if-match');
  if (!h) return undefined;
  const n = Number(h.replace(/^W\//, '').replace(/"/g, ''));
  if (!Number.isInteger(n)) throw new ApiError(400, 'bad_if_match', 'If-Match ha de ser la versió de la missió');
  return n;
}

/* fa un canvi en nom de la sessió i avisa els taulers connectats */
export async function change<T>(c: Ctx, action: string, work: (uow: UnitOfWork) => Promise<T>): Promise<{ rev: number; items: ChangeItem[]; result: T }> {
  const { db, hub, now } = c.get('deps');
  const s = c.get('session');
  const done = await mutate(db, { role: s.role, sessionId: s.id }, action, work, describe(action), now());
  if (done.items.length) hub.poke().catch(() => {});
  return done;
}

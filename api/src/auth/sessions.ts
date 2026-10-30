/* Sessions: cada dispositiu té una clau (bearer) que el tauler guarda al navegador. A la base de dades només hi ha
   el seu hash. Una sessió de jugador dura un any (la tele no ha de demanar-la cada setmana); el permís de DM dura
   30 dies i caduca si fa 12 hores que no s'usa: llavors la sessió torna a ser de jugador. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import type { Role } from '@mina/model';
import type { Db } from '../db/client.ts';
import { credentials, sessions } from '../db/schema.ts';
import { verifyPassword } from './passwords.ts';

const DAY = 86_400_000;
export const SESSION_TTL = 365 * DAY;
export const DM_TTL = 30 * DAY;
export const DM_IDLE = 12 * 3_600_000;
/* last_seen només s'escriu si ha passat un minut (no cal una escriptura per petició) */
const TOUCH_EVERY = 60_000;

export interface SessionInfo {
  id: string;
  role: Role;
  label: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export async function checkPassword(db: Db, role: Role, password: string): Promise<boolean> {
  const [row] = await db.select().from(credentials).where(eq(credentials.role, role));
  return !!row && (await verifyPassword(password, row.hash));
}

export async function hasPassword(db: Db, role: Role): Promise<boolean> {
  const [row] = await db.select({ role: credentials.role }).from(credentials).where(eq(credentials.role, role));
  return !!row;
}

export async function setPasswordHash(db: Db, role: Role, hash: string, now: Date): Promise<void> {
  await db.insert(credentials).values({ role, hash, updatedAt: now }).onConflictDoUpdate({ target: credentials.role, set: { hash, updatedAt: now } });
  /* qui entrava amb la contrasenya vella ja no pot: canviar la del grup tanca totes les sessions; la del DM treu el permís de DM */
  if (role === 'player') await db.delete(sessions);
  else await db.update(sessions).set({ role: 'player', dmUntil: null }).where(eq(sessions.role, 'dm'));
}

export async function createSession(db: Db, role: Role, label: string, now: Date): Promise<{ token: string; session: SessionInfo }> {
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  await db.insert(sessions).values({
    id,
    tokenHash: hashToken(token),
    role,
    label,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL),
    dmUntil: role === 'dm' ? new Date(now.getTime() + DM_TTL) : null
  });
  return { token, session: { id, role, label } };
}

export async function resolveSession(db: Db, token: string, now: Date): Promise<SessionInfo | null> {
  const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  if (!s || s.expiresAt <= now) return null;
  let role = s.role as Role;
  const patch: Partial<typeof sessions.$inferInsert> = {};
  if (role === 'dm' && (!s.dmUntil || s.dmUntil <= now || now.getTime() - s.lastSeenAt.getTime() > DM_IDLE)) {
    role = 'player';
    patch.role = 'player';
    patch.dmUntil = null;
  }
  if (now.getTime() - s.lastSeenAt.getTime() > TOUCH_EVERY) patch.lastSeenAt = now;
  if (Object.keys(patch).length) await db.update(sessions).set(patch).where(eq(sessions.id, s.id));
  return { id: s.id, role, label: s.label };
}

export async function setSessionRole(db: Db, id: string, role: Role, now: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ role, dmUntil: role === 'dm' ? new Date(now.getTime() + DM_TTL) : null, lastSeenAt: now })
    .where(eq(sessions.id, id));
}

export async function deleteSession(db: Db, id: string): Promise<boolean> {
  const rows = await db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
  return rows.length > 0;
}

export async function listSessions(db: Db, now: Date) {
  const rows = await db.select().from(sessions).orderBy(sql`${sessions.lastSeenAt} desc`);
  return rows
    .filter((s) => s.expiresAt > now)
    .map((s) => ({ id: s.id, role: s.role as Role, label: s.label, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString() }));
}

export async function pruneSessions(db: Db, now: Date): Promise<number> {
  const rows = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  return rows.length;
}

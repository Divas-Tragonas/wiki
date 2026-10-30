/* Còpies de tota la campanya dins de la base de dades: abans de cada importació i restauració, cada nit i quan el
   DM en vol una. Restaurar-ne una també en fa una de l'estat actual, per si de cas. */
import { desc, eq, inArray } from 'drizzle-orm';
import type { CampaignData } from '@mina/model';
import type { Db } from '../db/client.ts';
import { snapshots } from '../db/schema.ts';
import { notFound } from '../errors.ts';
import * as repo from '../store/repo.ts';
import { mutate, type Actor } from '../store/uow.ts';
import { describe } from './summaries.ts';

export async function createSnapshot(db: Db, reason: string, label = '', now = new Date()) {
  const data = await repo.loadAll(db);
  const rev = await repo.currentRev(db);
  const [row] = await db.insert(snapshots).values({ at: now, reason, label, rev, data }).returning({ id: snapshots.id });
  return { id: row.id, at: now.toISOString(), reason, label, rev };
}

export async function listSnapshots(db: Db) {
  const rows = await db
    .select({ id: snapshots.id, at: snapshots.at, reason: snapshots.reason, label: snapshots.label, rev: snapshots.rev })
    .from(snapshots)
    .orderBy(desc(snapshots.id));
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}

export async function restoreSnapshot(db: Db, actor: Actor, id: number, now = new Date()) {
  const [row] = await db.select().from(snapshots).where(eq(snapshots.id, id));
  if (!row) throw notFound('snapshot');
  await createSnapshot(db, 'pre-restore', `Abans de restaurar la còpia ${id}`, now);
  return mutate(
    db, actor, 'snapshot.restore',
    async (uow) => {
      await repo.replaceAll(uow.tx, row.data as CampaignData, now);
      uow.markReload();
    },
    describe('snapshot.restore'),
    now
  );
}

/* es queden les `keep` més noves de cada motiu */
export async function pruneSnapshots(db: Db, keep = 30): Promise<number> {
  const rows = await db.select({ id: snapshots.id, reason: snapshots.reason }).from(snapshots).orderBy(desc(snapshots.id));
  const count = new Map<string, number>(), drop: number[] = [];
  for (const r of rows) {
    const n = (count.get(r.reason) || 0) + 1;
    count.set(r.reason, n);
    if (n > keep) drop.push(r.id);
  }
  if (drop.length) await db.delete(snapshots).where(inArray(snapshots.id, drop));
  return drop.length;
}


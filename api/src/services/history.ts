/* Historial de canvis i «desfer». Desfer un canvi torna cada element a com era abans, però només si ningú no l'ha
   tornat a canviar després (si no, 409). L'acció de desfer és un canvi més: també es pot desfer. */
import { and, desc, eq, lt } from 'drizzle-orm';
import { sameValue, type ChangeItem, type Eco, type Pose, type Quest } from '@mina/model';
import type { Db } from '../db/client.ts';
import { changes } from '../db/schema.ts';
import { conflict, notFound } from '../errors.ts';
import { mutate, type Actor, type UnitOfWork } from '../store/uow.ts';
import { describe } from './summaries.ts';

const NOT_UNDOABLE = new Set(['import.replace', 'snapshot.restore']);

export async function listHistory(db: Db, before: number | null, limit: number) {
  const rows = await db
    .select({ rev: changes.rev, at: changes.at, action: changes.action, summary: changes.summary, role: changes.role, undoneBy: changes.undoneBy })
    .from(changes)
    .where(before ? lt(changes.rev, before) : undefined)
    .orderBy(desc(changes.rev))
    .limit(limit);
  return rows.map((r) => ({ ...r, at: r.at.toISOString(), undoable: !r.undoneBy && !NOT_UNDOABLE.has(r.action) }));
}

async function current(uow: UnitOfWork, it: ChangeItem): Promise<unknown> {
  const [a, b] = it.id.includes('/') ? [it.id.slice(0, it.id.indexOf('/')), it.id.slice(it.id.indexOf('/') + 1)] : [it.id, ''];
  switch (it.kind) {
    case 'quest': return uow.quest(it.id);
    case 'eco': return uow.eco(it.id);
    case 'place': return uow.place(a, b);
    case 'layout': return uow.pose(a, b);
    case 'campaign': return uow.meta();
    default: return null;
  }
}

async function restore(uow: UnitOfWork, it: ChangeItem) {
  const [a, b] = it.id.includes('/') ? [it.id.slice(0, it.id.indexOf('/')), it.id.slice(it.id.indexOf('/') + 1)] : [it.id, ''];
  switch (it.kind) {
    case 'quest': return uow.setQuest(it.id, it.before as Quest | null);
    case 'eco': return uow.setEco(it.id, it.before as Eco | null);
    case 'place': return uow.setPlace(a, b, it.before as string | null);
    case 'layout': return uow.setPose(a, b, it.before as Pose | null);
    case 'campaign': return uow.setMeta(it.before);
  }
}

export async function undo(db: Db, actor: Actor, rev: number, now = new Date()) {
  const [row] = await db.select().from(changes).where(eq(changes.rev, rev));
  if (!row) throw notFound('change');
  if (NOT_UNDOABLE.has(row.action) || row.items.some((i) => i.kind === 'reload')) throw conflict('not_undoable', 'Aquest canvi no es pot desfer: restaura una còpia');
  if (row.undoneBy) throw conflict('already_undone', 'Aquest canvi ja s’ha desfet');
  const committed = await mutate(
    db, actor, 'undo',
    async (uow) => {
      for (const it of [...row.items].reverse()) {
        if (!sameValue(await current(uow, it), it.after)) throw conflict('changed_since', 'Hi ha hagut canvis després d’aquest: no es pot desfer');
      }
      for (const it of [...row.items].reverse()) await restore(uow, it);
    },
    describe('undo'),
    now
  );
  if (committed.items.length) await db.update(changes).set({ undoneBy: committed.rev }).where(and(eq(changes.rev, rev)));
  return committed;
}

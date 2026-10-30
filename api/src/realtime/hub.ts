/* Esdeveniments en directe.
   El hub no rep els canvis directament: els llegeix de la taula `changes` per ordre de revisió. Així cada tauler els
   rep en ordre i sense forats, encara que dos canvis acabin alhora, i també arriben els que fa un altre procés (la
   CLI, en importar una còpia): a més de l'avís dels canvis fets aquí (poke), es mira la revisió cada pocs segons.
   Quan un tauler es reconnecta amb Last-Event-ID, se li reenvien els canvis que s'ha perdut; si són massa (o ja s'han
   esborrat de l'historial) se li diu que recarregui. */
import { and, asc, gt, isNull, lte } from 'drizzle-orm';
import { eventsFor, type BoardEvent, type ChangeItem, type Pose, type Role, type TownId } from '@mina/model';
import type { Db } from '../db/client.ts';
import { changes, quests } from '../db/schema.ts';
import * as repo from '../store/repo.ts';

export interface Conn {
  sessionId: string;
  role: Role;
  town: TownId;
  /* última revisió enviada a aquest tauler */
  lastRev: number;
  replaying: boolean;
  send: (rev: number, events: BoardEvent[]) => Promise<void>;
  close: () => void;
}

interface ChangeRow { rev: number; items: ChangeItem[] }
interface Context { hidden: Map<string, boolean>; layouts: Record<string, Record<string, Pose>> }

const MAX_REPLAY = 500;
const BATCH = 200;

export class Hub {
  private conns = new Set<Conn>();
  private published: number;
  private draining: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly db: Db;

  constructor(db: Db, startRev: number) {
    this.db = db;
    this.published = startRev;
  }

  get size() {
    return this.conns.size;
  }

  /* mira cada `ms` si hi ha canvis fets per un altre procés */
  watch(ms: number) {
    this.timer = setInterval(async () => {
      try {
        if ((await repo.currentRev(this.db)) > this.published) this.poke();
      } catch {
        /* la base de dades pot no respondre un moment */
      }
    }, ms);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    for (const c of this.conns) c.close();
    this.conns.clear();
  }

  /* hi ha canvis nous: s'envien quan acabi l'enviament que estigui en marxa */
  poke(): Promise<void> {
    if (this.draining) {
      this.again = true;
      return this.draining;
    }
    this.draining = (async () => {
      do {
        this.again = false;
        await this.drain();
      } while (this.again);
    })().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async drain() {
    for (;;) {
      const rows = await this.changesAfter(this.published, BATCH);
      if (!rows.length) return;
      const ctx = await this.context();
      for (const row of rows) {
        for (const c of this.conns) if (!c.replaying && row.rev > c.lastRev) await this.deliver(c, row, ctx);
        this.published = row.rev;
      }
    }
  }

  private async changesAfter(rev: number, limit: number): Promise<ChangeRow[]> {
    return this.db.select({ rev: changes.rev, items: changes.items }).from(changes).where(gt(changes.rev, rev)).orderBy(asc(changes.rev)).limit(limit);
  }

  private async context(): Promise<Context> {
    const rows = await this.db.select({ id: quests.id, hidden: quests.hidden }).from(quests).where(isNull(quests.deletedAt));
    return { hidden: new Map(rows.map((r) => [r.id, r.hidden])), layouts: await repo.loadLayouts(this.db) };
  }

  private async deliver(c: Conn, row: ChangeRow, ctx: Context) {
    const events = eventsFor(row.items, {
      role: c.role,
      town: c.town,
      questVisible: (id) => ctx.hidden.get(id) === false,
      pose: (piece) => ctx.layouts[c.town]?.[piece] ?? null
    });
    c.lastRev = row.rev;
    try {
      await c.send(row.rev, events);
    } catch {
      this.remove(c);
      c.close();
    }
  }

  /* afegeix un tauler que ja té la revisió `fromRev` i li envia el que s'ha perdut */
  async add(c: Conn): Promise<void> {
    c.replaying = true;
    this.conns.add(c);
    try {
      /* les revisions són consecutives: si falta la següent, l'historial ja s'ha esborrat */
      const head = await repo.currentRev(this.db);
      if (c.lastRev !== head) {
        const [next] = await this.db.select({ rev: changes.rev }).from(changes).where(gt(changes.rev, c.lastRev)).orderBy(asc(changes.rev)).limit(1);
        const gap = c.lastRev > head || !next || next.rev !== c.lastRev + 1;
        if (gap || head - c.lastRev > MAX_REPLAY) {
          c.lastRev = head;
          await c.send(head, [{ type: 'board.reload' }]);
        }
      }
      /* posar-se al dia fins a la revisió que el hub ja ha enviat a tothom; a partir d'aquí ho fa el hub */
      while (c.lastRev < this.published) {
        const rows = await this.db
          .select({ rev: changes.rev, items: changes.items })
          .from(changes)
          .where(and(gt(changes.rev, c.lastRev), lte(changes.rev, this.published)))
          .orderBy(asc(changes.rev))
          .limit(BATCH);
        if (!rows.length) { c.lastRev = this.published; break; }
        const ctx = await this.context();
        for (const row of rows) await this.deliver(c, row, ctx);
      }
    } finally {
      c.replaying = false;
    }
    /* el que hagi entrat mentre tant arriba amb el següent enviament */
    if (c.lastRev < (await repo.currentRev(this.db))) this.poke();
  }

  remove(c: Conn) {
    this.conns.delete(c);
  }

  /* la sessió ha canviat de rol o s'ha tancat: els seus taulers s'han de tornar a connectar */
  closeSession(sessionId: string) {
    for (const c of [...this.conns]) {
      if (c.sessionId === sessionId) {
        this.conns.delete(c);
        c.close();
      }
    }
  }

  closeAll() {
    for (const c of [...this.conns]) c.close();
    this.conns.clear();
  }

  /* per als tests: la base de dades s'ha buidat */
  reset(rev: number) {
    this.closeAll();
    this.published = rev;
  }
}

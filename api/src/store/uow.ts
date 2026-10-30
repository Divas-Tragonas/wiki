/* Unitat de treball: tot canvi de dades passa per aquí.
   - Es llegeix el que es toca (queda guardat com a «abans») i es diu com ha de quedar («després»).
   - En confirmar, només es desa el que ha canviat de debò; cada missió que canvia puja de versió.
   - Si hi ha algun canvi, puja la revisió de la campanya i el canvi queda a l'historial (per desfer-lo i per enviar-lo
     als taulers connectats). Si no n'hi ha cap, no passa res.
   Tot dins d'una transacció que comença bloquejant la fila de la campanya: els canvis s'apliquen d'un en un. */
import { sameValue, type CampaignMeta, type ChangeItem, type Eco, type Pose, type Quest, type Role } from '@mina/model';
import type { Db } from '../db/client.ts';
import { changes } from '../db/schema.ts';
import * as repo from './repo.ts';

type Kind = ChangeItem['kind'];
interface Slot { kind: Kind; id: string; before: unknown; after: unknown; touched: boolean }

export interface Actor {
  role: Role;
  sessionId: string | null;
}

export class UnitOfWork {
  private slots = new Map<string, Slot>();
  private reloaded = false;
  readonly tx: Db;
  readonly now: Date;

  constructor(tx: Db, now: Date) {
    this.tx = tx;
    this.now = now;
  }

  private async slot<T>(kind: Kind, id: string, load: () => Promise<T>): Promise<Slot> {
    const key = kind + ':' + id;
    let s = this.slots.get(key);
    if (!s) {
      const v = await load();
      s = { kind, id, before: v, after: v, touched: false };
      this.slots.set(key, s);
    }
    return s;
  }
  private async get<T>(kind: Kind, id: string, load: () => Promise<T>): Promise<T> {
    return structuredClone((await this.slot(kind, id, load)).after) as T;
  }
  private async set<T>(kind: Kind, id: string, load: () => Promise<T>, value: T): Promise<void> {
    const s = await this.slot(kind, id, load);
    s.after = structuredClone(value);
    s.touched = true;
  }

  quest = (id: string) => this.get<Quest | null>('quest', id, () => repo.loadQuest(this.tx, id));
  setQuest = (id: string, q: Quest | null) => this.set('quest', id, () => repo.loadQuest(this.tx, id), q);

  eco = (id: string) => this.get<Eco | null>('eco', id, () => repo.loadEco(this.tx, id));
  setEco = (id: string, e: Eco | null) => this.set('eco', id, () => repo.loadEco(this.tx, id), e);

  place = (town: string, place: string) => this.get<string | null>('place', `${town}/${place}`, () => repo.loadPlace(this.tx, town, place));
  setPlace = (town: string, place: string, text: string | null) =>
    this.set('place', `${town}/${place}`, () => repo.loadPlace(this.tx, town, place), text);

  pose = (town: string, piece: string) => this.get<Pose | null>('layout', `${town}/${piece}`, () => repo.loadPose(this.tx, town, piece));
  setPose = (town: string, piece: string, pose: Pose | null) =>
    this.set('layout', `${town}/${piece}`, () => repo.loadPose(this.tx, town, piece), pose);

  meta = () => this.get<CampaignMeta>('campaign', 'main', () => repo.loadMeta(this.tx));
  setMeta = (m: CampaignMeta) => this.set('campaign', 'main', () => repo.loadMeta(this.tx), m);

  /* importació o restauració: qui la crida ja ha substituït les dades */
  markReload() {
    this.reloaded = true;
  }

  /* desa el que ha canviat i retorna els elements per a l'historial (buit si no ha canviat res) */
  async flush(): Promise<ChangeItem[]> {
    if (this.reloaded) return [{ kind: 'reload', id: '*', before: null, after: null }];
    const items: ChangeItem[] = [];
    for (const s of this.slots.values()) {
      if (!s.touched || sameValue(s.before, s.after)) continue;
      if (s.kind === 'quest' && s.after) {
        const before = s.before as Quest | null;
        (s.after as Quest).version = (before ? before.version : await repo.storedQuestVersion(this.tx, s.id)) + 1;
      }
      await this.persist(s);
      items.push({ kind: s.kind, id: s.id, before: s.before, after: s.after } as ChangeItem);
    }
    return items;
  }

  private async persist(s: Slot) {
    const [a, b] = s.id.includes('/') ? [s.id.slice(0, s.id.indexOf('/')), s.id.slice(s.id.indexOf('/') + 1)] : [s.id, ''];
    switch (s.kind) {
      case 'quest': return repo.saveQuest(this.tx, s.id, s.after as Quest | null, this.now);
      case 'eco': return repo.saveEco(this.tx, s.id, s.after as Eco | null);
      case 'place': return repo.savePlace(this.tx, a, b, s.after as string | null);
      case 'layout': return repo.savePose(this.tx, a, b, s.after as Pose | null);
      case 'campaign': return repo.saveMeta(this.tx, s.after as CampaignMeta);
      case 'reload': return;
    }
  }
}

export interface Committed<T> {
  result: T;
  rev: number;
  items: ChangeItem[];
}

/* Executa un canvi. `describe` fa el resum de l'historial a partir dels elements que han canviat. */
export async function mutate<T>(
  db: Db,
  actor: Actor,
  action: string,
  work: (uow: UnitOfWork) => Promise<T>,
  describe: (items: ChangeItem[], result: T) => string,
  now = new Date()
): Promise<Committed<T>> {
  return db.transaction(async (tx) => {
    let rev = await repo.lockCampaign(tx as Db);
    const uow = new UnitOfWork(tx as Db, now);
    const result = await work(uow);
    const items = await uow.flush();
    if (items.length) {
      rev = await repo.bumpRev(tx as Db);
      await (tx as Db).insert(changes).values({ rev, at: now, action, summary: describe(items, result), role: actor.role, sessionId: actor.sessionId, items });
    }
    return { result, rev, items };
  });
}

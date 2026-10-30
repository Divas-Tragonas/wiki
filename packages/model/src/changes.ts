/* Canvis i esdeveniments en directe.
   Cada canvi que fa l'API és una llista d'elements amb l'estat d'abans i el de després (per poder-lo desfer i per
   reenviar-lo a qui s'ha desconnectat). Els esdeveniments que rep cada tauler se'n deriven aquí, segons el rol i el
   poble del tauler, perquè un jugador no en pugui deduir res que no hagi de veure. */
import type { Eco, Party, PlayerQuest, Pose, Quest, Role } from './schema.ts';
import type { TownId } from './towns.ts';
import { canSeeQuest, ecoView, isFixedPiece, isOnTown, questView } from './visibility.ts';

export interface CampaignMeta {
  tracked: string | null;
  party: Party;
}

export type ChangeItem =
  | { kind: 'quest'; id: string; before: Quest | null; after: Quest | null }
  | { kind: 'eco'; id: string; before: Eco | null; after: Eco | null }
  /* id: «poble/lloc» */
  | { kind: 'place'; id: string; before: string | null; after: string | null }
  /* id: «poble/peça» */
  | { kind: 'layout'; id: string; before: Pose | null; after: Pose | null }
  | { kind: 'campaign'; id: 'main'; before: CampaignMeta; after: CampaignMeta }
  /* importació o restauració: tot pot haver canviat */
  | { kind: 'reload'; id: '*'; before: null; after: null };

export type BoardEvent =
  | { type: 'quest.upserted'; quest: Quest | PlayerQuest }
  | { type: 'quest.removed'; id: string }
  | { type: 'eco.changed'; eco: Eco }
  | { type: 'eco.removed'; id: string }
  | { type: 'place.changed'; place: string; text: string | null }
  | { type: 'layout.changed'; pieces: Record<string, Pose | null> }
  | { type: 'tracked.changed'; tracked: string | null }
  | { type: 'party.changed'; party: Party }
  | { type: 'board.reload' };

export const splitKey = (id: string): [string, string] => {
  const i = id.indexOf('/');
  return [id.slice(0, i), id.slice(i + 1)];
};

export interface EventContext {
  role: Role;
  town: TownId;
  /* estat actual (després del canvi): si una missió es veu, i on és cada peça */
  questVisible: (id: string) => boolean;
  pose: (piece: string) => Pose | null;
}

const visibleOn = (q: Quest | null, ctx: EventContext) => !!q && isOnTown(q, ctx.town) && canSeeQuest(ctx.role, q);

/* Els esdeveniments d'un canvi per a un tauler concret. Llista buida si aquest tauler no n'ha de saber res. */
export function eventsFor(items: ChangeItem[], ctx: EventContext): BoardEvent[] {
  const out: BoardEvent[] = [];
  const pieces: Record<string, Pose | null> = {};
  let piecesTouched = false;
  /* si una missió canvia en aquest mateix canvi, la seva visibilitat d'abans i de després surt d'aquí, no de l'estat actual */
  const quests = new Map<string, { before: Quest | null; after: Quest | null }>();
  for (const it of items) if (it.kind === 'quest') quests.set(it.id, { before: it.before, after: it.after });
  const visible = (id: string, when: 'before' | 'after') => {
    const q = quests.get(id);
    if (!q) return ctx.questVisible(id);
    const v = q[when];
    return !!v && !v.hidden;
  };
  const trackedFor = (m: CampaignMeta, when: 'before' | 'after') => (m.tracked && (ctx.role === 'dm' || visible(m.tracked, when)) ? m.tracked : null);

  for (const it of items) {
    switch (it.kind) {
      case 'reload':
        return [{ type: 'board.reload' }];
      case 'quest': {
        const was = visibleOn(it.before, ctx), is = visibleOn(it.after, ctx);
        if (is) {
          out.push({ type: 'quest.upserted', quest: questView(ctx.role, it.after as Quest) as Quest | PlayerQuest });
          /* si un jugador la veu per primer cop, també ha de saber on és el seu paper */
          if (!was && ctx.role === 'player') {
            const p = ctx.pose(it.id);
            if (p) { pieces[it.id] = p; piecesTouched = true; }
          }
        } else if (was) out.push({ type: 'quest.removed', id: it.id });
        break;
      }
      case 'eco':
        out.push(it.after ? { type: 'eco.changed', eco: ecoView(ctx.role, it.after) } : { type: 'eco.removed', id: it.id });
        break;
      case 'place': {
        const [town, place] = splitKey(it.id);
        if (town === ctx.town) out.push({ type: 'place.changed', place, text: it.after });
        break;
      }
      case 'layout': {
        const [town, piece] = splitKey(it.id);
        if (town !== ctx.town) break;
        if (ctx.role === 'player' && !isFixedPiece(piece) && !visible(piece, 'after')) break;
        pieces[piece] = it.after;
        piecesTouched = true;
        break;
      }
      case 'campaign': {
        const tb = trackedFor(it.before, 'before'), ta = trackedFor(it.after, 'after');
        if (tb !== ta) out.push({ type: 'tracked.changed', tracked: ta });
        if (JSON.stringify(it.before.party) !== JSON.stringify(it.after.party)) out.push({ type: 'party.changed', party: it.after.party });
        break;
      }
    }
  }
  if (piecesTouched) out.push({ type: 'layout.changed', pieces });
  return out;
}

/* Un element sense canvis reals no es desa ni s'envia (la versió de les missions no compta) */
export function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(strip(a)) === stableStringify(strip(b));
}
const strip = (v: unknown) => (v && typeof v === 'object' && 'version' in (v as object) ? { ...(v as object), version: 0 } : v);
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}

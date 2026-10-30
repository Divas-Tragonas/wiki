/* Què pot veure cada rol. El DM ho veu tot; els jugadors no veuen les missions ocultes, les notes del DM, els ecos
   per recuperar ni on són les peces de missions ocultes. L'API ho aplica a cada resposta i a cada esdeveniment. */
import type { BoardView, CampaignData, Eco, PlayerQuest, Pose, Quest, Role } from './schema.ts';
import { FIXED_PIECES } from './constants.ts';
import type { TownId } from './towns.ts';

export const isOnTown = (q: Pick<Quest, 'towns'>, town: TownId) => Object.prototype.hasOwnProperty.call(q.towns, town);

export const canSeeQuest = (role: Role, q: Pick<Quest, 'hidden'>) => role === 'dm' || !q.hidden;

export function questView(role: Role, q: Quest): Quest | PlayerQuest | null {
  if (role === 'dm') return q;
  if (q.hidden) return null;
  const { note: _note, ...rest } = q;
  return rest;
}

export function ecoView(role: Role, e: Eco): Eco {
  if (role === 'dm' || e.unlocked) return e;
  return { id: e.id, num: e.num, position: e.position, title: '', text: '', unlocked: false };
}

/* la missió seguida només es veu si la missió es veu */
export function trackedView(role: Role, tracked: string | null, quests: Pick<Quest, 'id' | 'hidden'>[]): string | null {
  if (!tracked || role === 'dm') return tracked;
  const q = quests.find((x) => x.id === tracked);
  return q && !q.hidden ? tracked : null;
}

export const isFixedPiece = (key: string) => (FIXED_PIECES as readonly string[]).includes(key);

export function layoutView(role: Role, layout: Record<string, Pose>, visibleIds: Set<string>): Record<string, Pose> {
  if (role === 'dm') return layout;
  return Object.fromEntries(Object.entries(layout).filter(([k]) => isFixedPiece(k) || visibleIds.has(k)));
}

/* el tauler d'un poble per a un rol: missions d'aquell poble (actives i completades), ordenades com a la campanya */
export function boardView(role: Role, data: CampaignData, town: TownId, rev: number): BoardView {
  const onTown = data.quests.filter((q) => isOnTown(q, town)).sort((a, b) => a.position - b.position);
  const quests = onTown.map((q) => questView(role, q)).filter((q): q is Quest | PlayerQuest => q !== null);
  const visibleIds = new Set(quests.map((q) => q.id));
  const board = data.boards[town] || { layout: {}, places: {} };
  return {
    rev,
    role,
    town,
    tracked: trackedView(role, data.tracked, data.quests),
    party: data.party,
    quests,
    ecos: [...data.ecos].sort((a, b) => a.position - b.position).map((e) => ecoView(role, e)),
    places: board.places,
    layout: layoutView(role, board.layout, visibleIds)
  };
}

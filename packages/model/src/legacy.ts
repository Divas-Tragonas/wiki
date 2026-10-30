/* El format antic: el de data.json (xifrat) i el de «Exportar» del tauler abans de l'API. L'exportació de l'API el
   manté (amb els identificadors dels objectius de més), així que una còpia es pot tornar a importar aquí o allà. */
import type { Board, CampaignData, Eco, Pose, Quest, Step } from './schema.ts';
import { CATEGORIES, PoseSchema } from './schema.ts';
import { TOWN_IDS, isTownId, type TownId } from './towns.ts';
import { newId } from './ids.ts';

/* ---------- tipus del format antic (tot opcional: hi ha fitxers de diverses èpoques) ---------- */
export interface LegacyStep { id?: string; t?: string; d?: boolean }
export interface LegacyQuest {
  id: string;
  cat?: string;
  title?: string;
  who?: string;
  giver?: string;
  where?: string;
  reward?: string;
  text?: string;
  special?: string | null;
  status?: string;
  doneAt?: number | null;
  hidden?: boolean;
  note?: string;
  steps?: LegacyStep[];
  towns?: string[];
  at?: Record<string, string>;
  /* molt antic: el lloc al mapa de Phentanil */
  place?: string;
}
export interface LegacyEco { id: string; num?: number | null; title?: string; text?: string; unlocked?: boolean }
export interface LegacyBoard { layout?: Record<string, unknown>; places?: Record<string, { text?: string }> }
export interface LegacyState {
  quests?: LegacyQuest[];
  ecos?: LegacyEco[];
  boards?: Record<string, LegacyBoard>;
  tracked?: string | null;
  party?: { level?: number; title?: string };
  /* molt antic: el tauler de Phentanil a l'arrel */
  layout?: Record<string, unknown>;
  places?: Record<string, { text?: string }>;
  /* fitxers d'un sol tauler */
  board?: string;
}

const obj = <T extends object>(o: unknown): T => (o && typeof o === 'object' && !Array.isArray(o) ? (o as T) : ({} as T));
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/* el mateix que feia el tauler en carregar dades: completa camps i migra els formats antics */
export function normalizeLegacy(input: unknown): Required<Pick<LegacyState, 'quests' | 'ecos' | 'boards'>> & LegacyState {
  const s = { ...obj<LegacyState>(input) };
  s.quests = Array.isArray(s.quests) ? s.quests.map((q) => ({ ...q })) : [];
  s.ecos = Array.isArray(s.ecos) ? s.ecos : [];
  const boards: Record<string, LegacyBoard> = { ...obj<Record<string, LegacyBoard>>(s.boards) };
  if (s.layout || s.places) {
    const b = (boards.phentanil = { ...obj<LegacyBoard>(boards.phentanil) });
    b.layout = b.layout || s.layout;
    b.places = b.places || s.places;
  }
  delete s.layout;
  delete s.places;
  for (const k of Object.keys(boards)) boards[k] = { layout: obj(boards[k]?.layout), places: obj(boards[k]?.places) };
  s.boards = boards;
  for (const q of s.quests) {
    q.steps = Array.isArray(q.steps) ? q.steps : [];
    q.status = q.status || 'active';
    if (!Array.isArray(q.towns) || !q.towns.length) q.towns = ['phentanil'];
    q.at = { ...obj<Record<string, string>>(q.at) };
    if (q.place && !q.at.phentanil) q.at.phentanil = q.place;
    delete q.place;
  }
  return s as ReturnType<typeof normalizeLegacy>;
}

function questFromLegacy(q: LegacyQuest, position: number): Quest {
  const towns: Partial<Record<TownId, string | null>> = {};
  for (const t of q.towns || []) if (isTownId(t)) towns[t] = (q.at && typeof q.at[t] === 'string' && q.at[t]) || null;
  if (!Object.keys(towns).length) towns.phentanil = (q.at && q.at.phentanil) || null;
  const steps: Step[] = (q.steps || []).map((s) => ({ id: typeof s.id === 'string' && s.id ? s.id : newId('s'), text: str(s.t), done: !!s.d }));
  return {
    id: q.id,
    version: 1,
    position,
    cat: (CATEGORIES as readonly string[]).includes(q.cat || '') ? (q.cat as Quest['cat']) : 'secundaria',
    title: str(q.title),
    text: str(q.text),
    reward: str(q.reward),
    who: str(q.who),
    giver: str(q.giver),
    where: str(q.where),
    special: typeof q.special === 'string' && q.special ? q.special : null,
    status: q.status === 'done' ? 'done' : 'active',
    doneAt: q.status === 'done' && typeof q.doneAt === 'number' ? Math.round(q.doneAt) : null,
    hidden: !!q.hidden,
    note: str(q.note),
    towns,
    steps
  };
}

const ecoFromLegacy = (e: LegacyEco, position: number): Eco => ({
  id: e.id,
  num: typeof e.num === 'number' ? e.num : null,
  position,
  title: str(e.title),
  text: str(e.text),
  unlocked: !!e.unlocked
});

function boardFromLegacy(b: LegacyBoard | undefined): Board {
  const layout: Record<string, Pose> = {};
  for (const [k, v] of Object.entries(obj<Record<string, unknown>>(b?.layout))) {
    const p = PoseSchema.safeParse(v);
    if (p.success) layout[k] = p.data;
  }
  const places: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj<Record<string, { text?: string }>>(b?.places))) if (v && typeof v.text === 'string') places[k] = v.text;
  return { layout, places };
}

/* Tota la campanya des del format antic. Les missions sense id vàlid o repetides es descarten (es compten a skipped). */
export function fromLegacy(input: unknown): { data: CampaignData; skipped: string[] } {
  const s = normalizeLegacy(input);
  const skipped: string[] = [];
  const seen = new Set<string>();
  const quests: Quest[] = [];
  for (const q of s.quests) {
    if (!q || typeof q.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(q.id) || q.id === 'map' || q.id === 'pile' || seen.has(q.id)) {
      skipped.push(String(q && q.id));
      continue;
    }
    seen.add(q.id);
    quests.push(questFromLegacy(q, quests.length));
  }
  /* els objectius no poden compartir identificador */
  const stepIds = new Set<string>();
  for (const q of quests) for (const st of q.steps) {
    if (stepIds.has(st.id)) st.id = newId('s');
    stepIds.add(st.id);
  }
  const ecos = s.ecos.filter((e) => e && typeof e.id === 'string').map(ecoFromLegacy);
  const boards = Object.fromEntries(TOWN_IDS.map((t) => [t, boardFromLegacy(s.boards[t])])) as Record<TownId, Board>;
  const ids = new Set(quests.map((q) => q.id));
  const party = obj<{ level?: number; title?: string }>(s.party);
  return {
    data: {
      tracked: typeof s.tracked === 'string' && ids.has(s.tracked) ? s.tracked : null,
      party: { level: Number.isInteger(party.level) && party.level! >= 1 ? party.level! : 1, title: str(party.title) },
      quests,
      ecos,
      boards
    },
    skipped
  };
}

/* La campanya en el format antic (el d'«Exportar»): es pot importar al tauler antic i a l'API. */
export function toLegacy(data: CampaignData): LegacyState & { quests: LegacyQuest[] } {
  const quests = [...data.quests].sort((a, b) => a.position - b.position).map((q): LegacyQuest => {
    const towns = Object.keys(q.towns);
    const at: Record<string, string> = {};
    for (const [t, p] of Object.entries(q.towns)) if (p) at[t] = p;
    const out: LegacyQuest = {
      id: q.id, cat: q.cat, title: q.title, who: q.who, giver: q.giver, where: q.where, reward: q.reward, text: q.text,
      steps: q.steps.map((s) => ({ id: s.id, t: s.text, d: s.done })),
      status: q.status, hidden: q.hidden, note: q.note, towns, at
    };
    if (q.special) out.special = q.special;
    if (q.doneAt !== null) out.doneAt = q.doneAt;
    return out;
  });
  const boards: Record<string, LegacyBoard> = {};
  for (const [t, b] of Object.entries(data.boards)) {
    boards[t] = { layout: b.layout, places: Object.fromEntries(Object.entries(b.places).map(([k, v]) => [k, { text: v }])) };
  }
  return {
    quests,
    ecos: [...data.ecos].sort((a, b) => a.position - b.position).map((e) => ({ id: e.id, num: e.num, title: e.title, text: e.text, unlocked: e.unlocked })),
    boards,
    tracked: data.tracked,
    party: data.party
  };
}

/* per enllaçar missions importades amb les que ja hi són pel títol */
export const titleKey = (t: string) =>
  String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

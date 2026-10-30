/* Regles de cada acció del DM sobre les dades. Reben la unitat de treball i l'entrada ja validada amb els esquemes de
   @mina/model; llancen ApiError si l'acció no té sentit. No saben res d'HTTP. */
import {
  isPlaceOf, isTownId, newId, fromLegacy, titleKey, TOWN_IDS,
  type Eco, type LegacyQuest, type Pose, type Quest, type QuestCreate, type QuestPatch, type TownId
} from '@mina/model';
import { conflict, invalid, notFound } from '../errors.ts';
import * as repo from '../store/repo.ts';
import type { UnitOfWork } from '../store/uow.ts';

/* ---------- missions ---------- */
async function mustQuest(uow: UnitOfWork, id: string, ifVersion?: number): Promise<Quest> {
  const q = await uow.quest(id);
  if (!q) throw notFound('quest');
  if (ifVersion !== undefined && ifVersion !== q.version) {
    throw conflict('version_mismatch', 'Una altra pantalla ha canviat aquesta missió', { quest: q });
  }
  return q;
}

function checkPlace(town: TownId, place: string | null | undefined) {
  if (place !== null && place !== undefined && !isPlaceOf(town, place)) throw invalid('unknown_place', `El lloc «${place}» no és al mapa`);
}

async function untrack(uow: UnitOfWork, id: string) {
  const m = await uow.meta();
  if (m.tracked === id) await uow.setMeta({ ...m, tracked: null });
}

async function claimStepId(uow: UnitOfWork, id: string | undefined, taken: Set<string>): Promise<string> {
  if (id === undefined) {
    let fresh = newId('s');
    while (taken.has(fresh)) fresh = newId('s');
    taken.add(fresh);
    return fresh;
  }
  if (taken.has(id) || (await repo.stepIdTaken(uow.tx, id))) throw conflict('step_exists', 'Ja hi ha un objectiu amb aquest identificador');
  taken.add(id);
  return id;
}

export async function createQuest(uow: UnitOfWork, body: QuestCreate): Promise<Quest> {
  const id = body.id ?? newId('q');
  if (await repo.questIdTaken(uow.tx, id)) throw conflict('quest_exists', 'Ja hi ha una missió amb aquest identificador');
  for (const [town, place] of Object.entries(body.towns)) checkPlace(town as TownId, place);
  const taken = new Set<string>();
  const steps = [];
  for (const s of body.steps ?? []) steps.push({ id: await claimStepId(uow, s.id, taken), text: s.text, done: !!s.done });
  const q: Quest = {
    id, version: 0, position: await repo.nextQuestPosition(uow.tx),
    cat: body.cat ?? 'secundaria', title: body.title ?? '', text: body.text ?? '', reward: body.reward ?? '', who: body.who ?? '',
    giver: body.giver ?? '', where: body.where ?? '', special: null, status: 'active', doneAt: null,
    hidden: body.hidden ?? true, note: body.note ?? '', towns: body.towns, steps
  };
  await uow.setQuest(id, q);
  return q;
}

export async function patchQuest(uow: UnitOfWork, id: string, patch: QuestPatch, ifVersion?: number) {
  const q = await mustQuest(uow, id, ifVersion);
  await uow.setQuest(id, { ...q, ...patch });
}

export async function setQuestState(uow: UnitOfWork, id: string, action: 'complete' | 'reopen' | 'hide' | 'reveal', ifVersion?: number) {
  const q = await mustQuest(uow, id, ifVersion);
  if (action === 'complete') {
    if (q.status !== 'done') await uow.setQuest(id, { ...q, status: 'done', doneAt: uow.now.getTime() });
    await untrack(uow, id);
  } else if (action === 'reopen') {
    await uow.setQuest(id, { ...q, status: 'active', doneAt: null });
  } else if (action === 'hide') {
    await uow.setQuest(id, { ...q, hidden: true });
    await untrack(uow, id);
  } else {
    await uow.setQuest(id, { ...q, hidden: false });
  }
}

export async function deleteQuest(uow: UnitOfWork, id: string, ifVersion?: number) {
  const q = await mustQuest(uow, id, ifVersion);
  await uow.setQuest(id, null);
  await untrack(uow, id);
  for (const town of TOWN_IDS) if (await uow.pose(town, id)) await uow.setPose(town, id, null);
  return q;
}

export async function linkTown(uow: UnitOfWork, id: string, town: TownId, place: string | null) {
  checkPlace(town, place);
  const q = await mustQuest(uow, id);
  await uow.setQuest(id, { ...q, towns: { ...q.towns, [town]: place } });
}

export async function unlinkTown(uow: UnitOfWork, id: string, town: TownId) {
  const q = await mustQuest(uow, id);
  if (!(town in q.towns)) return;
  if (Object.keys(q.towns).length === 1) throw conflict('last_town', 'La missió ha de sortir com a mínim en un tauler');
  const towns = { ...q.towns };
  delete towns[town];
  await uow.setQuest(id, { ...q, towns });
  if (await uow.pose(town, id)) await uow.setPose(town, id, null);
}

/* ---------- objectius ---------- */
export async function addStep(uow: UnitOfWork, id: string, s: { id?: string; text: string; done: boolean; after?: string | null }) {
  const q = await mustQuest(uow, id);
  if (q.steps.length >= 100) throw invalid('too_many_steps', 'Massa objectius');
  const stepId = await claimStepId(uow, s.id, new Set(q.steps.map((x) => x.id)));
  const steps = [...q.steps];
  let at = steps.length;
  if (s.after) {
    const i = steps.findIndex((x) => x.id === s.after);
    if (i < 0) throw notFound('step');
    at = i + 1;
  } else if (s.after === null) at = 0;
  steps.splice(at, 0, { id: stepId, text: s.text, done: s.done });
  await uow.setQuest(id, { ...q, steps });
  return stepId;
}

export async function patchStep(uow: UnitOfWork, id: string, stepId: string, patch: { text?: string; done?: boolean }) {
  const q = await mustQuest(uow, id);
  const i = q.steps.findIndex((x) => x.id === stepId);
  if (i < 0) throw notFound('step');
  const steps = [...q.steps];
  steps[i] = { ...steps[i], ...patch };
  await uow.setQuest(id, { ...q, steps });
}

export async function deleteStep(uow: UnitOfWork, id: string, stepId: string) {
  const q = await mustQuest(uow, id);
  if (!q.steps.some((x) => x.id === stepId)) throw notFound('step');
  await uow.setQuest(id, { ...q, steps: q.steps.filter((x) => x.id !== stepId) });
}

export async function orderSteps(uow: UnitOfWork, id: string, ids: string[]) {
  const q = await mustQuest(uow, id);
  const current = q.steps.map((x) => x.id);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((x) => current.includes(x))) {
    throw invalid('bad_order', 'L’ordre ha d’incloure tots els objectius un sol cop');
  }
  await uow.setQuest(id, { ...q, steps: ids.map((x) => q.steps.find((s) => s.id === x)!) });
}

/* ---------- campanya ---------- */
export async function setTracked(uow: UnitOfWork, questId: string | null) {
  if (questId !== null && !(await uow.quest(questId))) throw notFound('quest');
  const m = await uow.meta();
  await uow.setMeta({ ...m, tracked: questId });
}

export async function patchParty(uow: UnitOfWork, patch: { level?: number; title?: string }) {
  const m = await uow.meta();
  await uow.setMeta({ ...m, party: { ...m.party, ...patch } });
}

/* ---------- ecos ---------- */
export async function createEco(uow: UnitOfWork, body: Partial<Eco>): Promise<Eco> {
  const id = body.id ?? newId('e');
  if (await uow.eco(id)) throw conflict('eco_exists', 'Ja hi ha un eco amb aquest identificador');
  const e: Eco = { id, num: body.num ?? null, position: await repo.nextEcoPosition(uow.tx), title: body.title ?? '', text: body.text ?? '', unlocked: body.unlocked ?? false };
  await uow.setEco(id, e);
  return e;
}

export async function patchEco(uow: UnitOfWork, id: string, patch: Partial<Eco>) {
  const e = await uow.eco(id);
  if (!e) throw notFound('eco');
  await uow.setEco(id, { ...e, ...patch, id, position: e.position });
}

export async function deleteEco(uow: UnitOfWork, id: string) {
  if (!(await uow.eco(id))) throw notFound('eco');
  await uow.setEco(id, null);
}

/* ---------- llocs i peces ---------- */
export async function setPlaceText(uow: UnitOfWork, town: TownId, place: string, text: string | null) {
  if (!isPlaceOf(town, place)) throw notFound('place');
  await uow.setPlace(town, place, text);
}

export async function patchLayout(uow: UnitOfWork, town: TownId, pieces: Record<string, Pose | null>) {
  for (const [piece, pose] of Object.entries(pieces)) {
    if (piece !== 'map' && piece !== 'pile') {
      const q = await uow.quest(piece);
      if (!q || !(town in q.towns)) {
        /* treure la posició d'una missió que ja no hi és sempre es pot */
        if (pose === null) { await uow.setPose(town, piece, null); continue; }
        throw invalid('unknown_piece', `«${piece}» no és cap peça d’aquest tauler`);
      }
    }
    await uow.setPose(town, piece, pose);
  }
}

/* ---------- importar un sol tauler ---------- */
/* Les missions del fitxer s'afegeixen al tauler `town`; les que ja hi són (mateix id o mateix títol) s'hi enllacen,
   amb el lloc del fitxer si no en tenien i la nota afegida a la seva. Els textos dels llocs del fitxer s'hi apliquen. */
export async function mergeBoard(uow: UnitOfWork, input: unknown, town: TownId) {
  /* sense normalitzar: un fitxer d'un poble pot dur el lloc a `place` (format antic) */
  const raw = (input && typeof input === 'object' && Array.isArray((input as { quests?: unknown }).quests) ? (input as { quests: LegacyQuest[] }).quests : []);
  const existing = await repo.loadQuests(uow.tx);
  const result = { added: 0, linked: 0 };
  const ids: Record<string, string> = {};
  let position = await repo.nextQuestPosition(uow.tx);
  for (const src of raw) {
    if (!src || typeof src.id !== 'string') continue;
    const at = (src.at && src.at[town]) || src.place || null;
    const place = at && isPlaceOf(town, at) ? at : null;
    const found = (await uow.quest(src.id)) || existing.find((x) => titleKey(x.title) === titleKey(src.title || ''));
    if (found) {
      const q = (await uow.quest(found.id))!;
      const towns = { ...q.towns };
      if (!(town in towns) || (place && !towns[town])) towns[town] = towns[town] || place;
      let note = q.note;
      if (src.note && !note.includes(src.note)) note = note ? note + '\n\n' + src.note : src.note;
      await uow.setQuest(q.id, { ...q, towns, note });
      ids[src.id] = q.id;
      result.linked++;
      continue;
    }
    const { data } = fromLegacy({ quests: [{ ...src, towns: [town], at: place ? { [town]: place } : {} }] });
    const q = data.quests[0];
    if (!q) continue;
    if (await repo.questIdTaken(uow.tx, q.id)) q.id = newId('q');
    const taken = new Set<string>();
    for (const s of q.steps) {
      const free = !taken.has(s.id) && !(await repo.stepIdTaken(uow.tx, s.id));
      s.id = await claimStepId(uow, free ? s.id : undefined, taken);
    }
    q.position = position++;
    await uow.setQuest(q.id, q);
    ids[src.id] = q.id;
    result.added++;
  }
  const places = (input && typeof input === 'object' && 'places' in input ? (input as { places: unknown }).places : null) as Record<string, { text?: string }> | null;
  if (places && typeof places === 'object') {
    for (const [p, v] of Object.entries(places)) if (isPlaceOf(town, p) && v && typeof v.text === 'string') await uow.setPlace(town, p, v.text);
  }
  const m = await uow.meta();
  const tracked = (input as { tracked?: unknown })?.tracked;
  if (!m.tracked && typeof tracked === 'string' && ids[tracked]) await uow.setMeta({ ...m, tracked: ids[tracked] });
  return result;
}

export const assertTown = (town: string): TownId => {
  if (!isTownId(town)) throw notFound('town');
  return town;
};

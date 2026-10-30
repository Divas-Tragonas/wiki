/* Llegir i escriure els agregats del domini (una missió amb els seus objectius i taulers, un eco, el text d'un lloc,
   la posició d'una peça, la campanya) sobre les taules. Tot el que canvia dades passa per la unitat de treball
   (uow.ts), que és qui crida les funcions save*. */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { TOWN_DEFS, TOWN_IDS, type Board, type CampaignData, type CampaignMeta, type Eco, type Pose, type Quest, type TownId } from '@mina/model';
import type { Db } from '../db/client.ts';
import { boardLayout, boardPlaces, campaign, ecos, questSteps, questTowns, quests, towns } from '../db/schema.ts';

/* una transacció es fa servir igual que la base de dades */
export type Exec = Db;

type QuestRow = typeof quests.$inferSelect;
type TownRow = typeof questTowns.$inferSelect;
type StepRow = typeof questSteps.$inferSelect;

function toQuest(r: QuestRow, ts: TownRow[], ss: StepRow[]): Quest {
  const townsMap: Quest['towns'] = {};
  for (const t of [...ts].sort((a, b) => a.position - b.position)) townsMap[t.townId as TownId] = t.placeId;
  return {
    id: r.id,
    version: r.version,
    position: r.position,
    cat: r.cat as Quest['cat'],
    title: r.title,
    text: r.text,
    reward: r.reward,
    who: r.who,
    giver: r.giver,
    where: r.whereText,
    special: r.special,
    status: r.status as Quest['status'],
    doneAt: r.doneAt,
    hidden: r.hidden,
    note: r.note,
    towns: townsMap,
    steps: [...ss].sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, text: s.text, done: s.done }))
  };
}

/* ---------- arrencada ---------- */
export async function ensureSeed(x: Exec): Promise<void> {
  await x.insert(campaign).values({ id: 1 }).onConflictDoNothing();
  for (const [i, id] of TOWN_IDS.entries()) {
    await x.insert(towns).values({ id, name: TOWN_DEFS[id].name, position: i }).onConflictDoUpdate({ target: towns.id, set: { name: TOWN_DEFS[id].name, position: i } });
  }
}

/* ---------- campanya ---------- */
export async function currentRev(x: Exec): Promise<number> {
  const [r] = await x.select({ rev: campaign.rev }).from(campaign).where(eq(campaign.id, 1));
  return r ? r.rev : 0;
}
/* bloqueja la fila de la campanya fins al final de la transacció: els canvis s'apliquen d'un en un */
export async function lockCampaign(x: Exec): Promise<number> {
  const rows = await x.execute<{ rev: string | number }>(sql`select rev from campaign where id = 1 for update`);
  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: { rev: string | number }[] }).rows;
  return Number(list[0]?.rev ?? 0);
}
export async function bumpRev(x: Exec): Promise<number> {
  const [r] = await x.update(campaign).set({ rev: sql`${campaign.rev} + 1` }).where(eq(campaign.id, 1)).returning({ rev: campaign.rev });
  return r.rev;
}
export async function loadMeta(x: Exec): Promise<CampaignMeta> {
  const [r] = await x.select().from(campaign).where(eq(campaign.id, 1));
  return { tracked: r?.trackedQuestId ?? null, party: { level: r?.partyLevel ?? 1, title: r?.partyTitle ?? '' } };
}
export async function saveMeta(x: Exec, m: CampaignMeta): Promise<void> {
  await x.update(campaign).set({ trackedQuestId: m.tracked, partyLevel: m.party.level, partyTitle: m.party.title }).where(eq(campaign.id, 1));
}

/* ---------- missions ---------- */
export async function loadQuest(x: Exec, id: string): Promise<Quest | null> {
  const [r] = await x.select().from(quests).where(and(eq(quests.id, id), isNull(quests.deletedAt)));
  if (!r) return null;
  const ts = await x.select().from(questTowns).where(eq(questTowns.questId, id));
  const ss = await x.select().from(questSteps).where(eq(questSteps.questId, id));
  return toQuest(r, ts, ss);
}
export async function loadQuests(x: Exec): Promise<Quest[]> {
  const rows = await x.select().from(quests).where(isNull(quests.deletedAt)).orderBy(asc(quests.position), asc(quests.id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ts = await x.select().from(questTowns).where(inArray(questTowns.questId, ids));
  const ss = await x.select().from(questSteps).where(inArray(questSteps.questId, ids));
  const byQuest = <T extends { questId: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const t of list) m.set(t.questId, [...(m.get(t.questId) || []), t]);
    return m;
  };
  const tm = byQuest(ts), sm = byQuest(ss);
  return rows.map((r) => toQuest(r, tm.get(r.id) || [], sm.get(r.id) || []));
}
/* hi ha (o hi ha hagut) una missió amb aquest id: els esborrats també reserven l'id, perquè «desfer» la pugui recuperar */
export async function questIdTaken(x: Exec, id: string): Promise<boolean> {
  const [r] = await x.select({ id: quests.id }).from(quests).where(eq(quests.id, id));
  return !!r;
}
/* versió desada, encara que la missió estigui esborrada: una missió recuperada no pot tornar a una versió vella */
export async function storedQuestVersion(x: Exec, id: string): Promise<number> {
  const [r] = await x.select({ version: quests.version }).from(quests).where(eq(quests.id, id));
  return r ? r.version : 0;
}
export async function stepIdTaken(x: Exec, id: string): Promise<boolean> {
  const [r] = await x.select({ id: questSteps.id }).from(questSteps).where(eq(questSteps.id, id));
  return !!r;
}
export async function nextQuestPosition(x: Exec): Promise<number> {
  const [r] = await x.select({ max: sql<number | null>`max(${quests.position})` }).from(quests);
  return r?.max === null || r?.max === undefined ? 0 : Number(r.max) + 1;
}
export async function saveQuest(x: Exec, id: string, q: Quest | null, now: Date): Promise<void> {
  await x.delete(questSteps).where(eq(questSteps.questId, id));
  await x.delete(questTowns).where(eq(questTowns.questId, id));
  if (!q) {
    await x.update(quests).set({ deletedAt: now, updatedAt: now }).where(eq(quests.id, id));
    return;
  }
  const row = {
    id: q.id, version: q.version, position: q.position, cat: q.cat, title: q.title, text: q.text, reward: q.reward, who: q.who,
    giver: q.giver, whereText: q.where, special: q.special, status: q.status, doneAt: q.doneAt, hidden: q.hidden, note: q.note,
    updatedAt: now, deletedAt: null
  };
  await x.insert(quests).values({ ...row, createdAt: now }).onConflictDoUpdate({ target: quests.id, set: row });
  const ts = Object.entries(q.towns).map(([townId, placeId], position) => ({ questId: id, townId, placeId: placeId ?? null, position }));
  if (ts.length) await x.insert(questTowns).values(ts);
  const ss = q.steps.map((s, position) => ({ id: s.id, questId: id, position, text: s.text, done: s.done }));
  if (ss.length) await x.insert(questSteps).values(ss);
}

/* ---------- ecos ---------- */
const toEco = (r: typeof ecos.$inferSelect): Eco => ({ id: r.id, num: r.num, position: r.position, title: r.title, text: r.text, unlocked: r.unlocked });
export async function loadEco(x: Exec, id: string): Promise<Eco | null> {
  const [r] = await x.select().from(ecos).where(eq(ecos.id, id));
  return r ? toEco(r) : null;
}
export async function loadEcos(x: Exec): Promise<Eco[]> {
  return (await x.select().from(ecos).orderBy(asc(ecos.position), asc(ecos.id))).map(toEco);
}
export async function nextEcoPosition(x: Exec): Promise<number> {
  const [r] = await x.select({ max: sql<number | null>`max(${ecos.position})` }).from(ecos);
  return r?.max === null || r?.max === undefined ? 0 : Number(r.max) + 1;
}
export async function saveEco(x: Exec, id: string, e: Eco | null): Promise<void> {
  if (!e) {
    await x.delete(ecos).where(eq(ecos.id, id));
    return;
  }
  const row = { num: e.num, position: e.position, title: e.title, text: e.text, unlocked: e.unlocked };
  await x.insert(ecos).values({ id, ...row }).onConflictDoUpdate({ target: ecos.id, set: row });
}

/* ---------- textos dels llocs ---------- */
export async function loadPlace(x: Exec, town: string, place: string): Promise<string | null> {
  const [r] = await x.select().from(boardPlaces).where(and(eq(boardPlaces.townId, town), eq(boardPlaces.placeId, place)));
  return r ? r.text : null;
}
export async function savePlace(x: Exec, town: string, place: string, text: string | null): Promise<void> {
  if (text === null) {
    await x.delete(boardPlaces).where(and(eq(boardPlaces.townId, town), eq(boardPlaces.placeId, place)));
    return;
  }
  await x.insert(boardPlaces).values({ townId: town, placeId: place, text }).onConflictDoUpdate({ target: [boardPlaces.townId, boardPlaces.placeId], set: { text } });
}

/* ---------- peces col·locades a mà ---------- */
export async function loadPose(x: Exec, town: string, piece: string): Promise<Pose | null> {
  const [r] = await x.select().from(boardLayout).where(and(eq(boardLayout.townId, town), eq(boardLayout.piece, piece)));
  return r ? r.pose : null;
}
export async function loadLayouts(x: Exec): Promise<Record<string, Record<string, Pose>>> {
  const out: Record<string, Record<string, Pose>> = {};
  for (const r of await x.select().from(boardLayout)) (out[r.townId] ||= {})[r.piece] = r.pose;
  return out;
}
export async function savePose(x: Exec, town: string, piece: string, pose: Pose | null): Promise<void> {
  if (pose === null) {
    await x.delete(boardLayout).where(and(eq(boardLayout.townId, town), eq(boardLayout.piece, piece)));
    return;
  }
  await x.insert(boardLayout).values({ townId: town, piece, pose }).onConflictDoUpdate({ target: [boardLayout.townId, boardLayout.piece], set: { pose } });
}

/* ---------- tota la campanya ---------- */
export async function loadAll(x: Exec): Promise<CampaignData> {
  const meta = await loadMeta(x);
  const layouts = await loadLayouts(x);
  const placeRows = await x.select().from(boardPlaces);
  const boards = Object.fromEntries(TOWN_IDS.map((t) => [t, { layout: layouts[t] || {}, places: {} } as Board])) as Record<TownId, Board>;
  for (const p of placeRows) if (boards[p.townId as TownId]) boards[p.townId as TownId].places[p.placeId] = p.text;
  return { tracked: meta.tracked, party: meta.party, quests: await loadQuests(x), ecos: await loadEcos(x), boards };
}

/* substitueix tota la campanya (importar una còpia sencera o restaurar-ne una) */
export async function replaceAll(x: Exec, data: CampaignData, now: Date): Promise<void> {
  await x.delete(questSteps);
  await x.delete(questTowns);
  await x.delete(quests);
  await x.delete(ecos);
  await x.delete(boardPlaces);
  await x.delete(boardLayout);
  for (const q of data.quests) await saveQuest(x, q.id, q, now);
  for (const e of data.ecos) await saveEco(x, e.id, e);
  for (const [town, b] of Object.entries(data.boards)) {
    for (const [place, text] of Object.entries(b.places)) await savePlace(x, town, place, text);
    for (const [piece, pose] of Object.entries(b.layout)) await savePose(x, town, piece, pose);
  }
  await saveMeta(x, { tracked: data.tracked, party: data.party });
}

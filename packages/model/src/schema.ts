/* Forma de les dades del tauler de missions: el que l'API desa i serveix, i el que el tauler fa servir en memòria. */
import { z } from 'zod';
import { TOWN_IDS, type TownId } from './towns.ts';

import { CATEGORIES, FIXED_PIECES, ROLES, type Role } from './constants.ts';
export { CATEGORIES, FIXED_PIECES, ROLES, type Category } from './constants.ts';
export type { Role };

/* identificadors: els genera qui crea l'element (el tauler, per poder-lo fer servir abans de la resposta) o l'API */
export const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/, 'Identificador no vàlid');
export const QuestId = Id.refine((v) => !(FIXED_PIECES as readonly string[]).includes(v), 'Aquest identificador és d’una peça del tauler');
export const TownIdSchema = z.enum(TOWN_IDS);

const text = (max: number) => z.string().max(max);
const LIMITS = { title: 200, short: 300, long: 5000 };

export const StepSchema = z.object({
  id: Id,
  text: text(LIMITS.short),
  done: z.boolean()
});
export type Step = z.infer<typeof StepSchema>;

/* quest.towns: taulers on surt la missió i el seu lloc al mapa de cadascun (null si no en té) */
export const TownsSchema = z
  .partialRecord(TownIdSchema, z.string().max(64).nullable())
  .refine((t) => Object.keys(t).length > 0, 'La missió ha de sortir com a mínim en un tauler');

export const QuestSchema = z.object({
  id: QuestId,
  version: z.number().int().nonnegative(),
  position: z.number().int(),
  cat: z.enum(CATEGORIES),
  title: text(LIMITS.title),
  text: text(LIMITS.long),
  reward: text(LIMITS.short),
  who: text(LIMITS.short),
  giver: text(LIMITS.short),
  where: text(LIMITS.short),
  /* paper especial: 'ecos' mostra la llista d'ecos */
  special: z.string().max(32).nullable(),
  status: z.enum(['active', 'done']),
  doneAt: z.number().int().nullable(),
  hidden: z.boolean(),
  note: text(LIMITS.long),
  towns: TownsSchema,
  steps: z.array(StepSchema).max(100)
});
export type Quest = z.infer<typeof QuestSchema>;
/* el que reben els jugadors: sense la nota del DM */
export type PlayerQuest = Omit<Quest, 'note'>;

export const EcoSchema = z.object({
  id: Id,
  num: z.number().int().nullable(),
  position: z.number().int(),
  title: text(LIMITS.title),
  text: text(LIMITS.long),
  unlocked: z.boolean()
});
export type Eco = z.infer<typeof EcoSchema>;

const coord = z.number().finite().min(-5000).max(5000);
/* posició d'una peça col·locada a mà: papers per centre (cx, cy, mida i ordre), mapa i pila per cantonada (x, y) */
export const PoseSchema = z
  .object({
    cx: coord.optional(),
    cy: coord.optional(),
    x: coord.optional(),
    y: coord.optional(),
    r: z.number().finite().min(-360).max(360),
    w: z.number().finite().positive().max(4000).optional(),
    h: z.number().finite().positive().max(4000).optional(),
    z: z.number().int().min(0).max(1000).optional()
  })
  .strict()
  .refine((p) => (p.cx !== undefined && p.cy !== undefined) || (p.x !== undefined && p.y !== undefined), 'Cal cx i cy, o x i y');
export type Pose = z.infer<typeof PoseSchema>;

export const PartySchema = z.object({
  level: z.number().int().min(1).max(30),
  title: text(LIMITS.title)
});
export type Party = z.infer<typeof PartySchema>;

export interface Board {
  layout: Record<string, Pose>;
  places: Record<string, string>;
}

/* tot l'estat de la campanya (el que hi ha a la base de dades) */
export interface CampaignData {
  tracked: string | null;
  party: Party;
  quests: Quest[];
  ecos: Eco[];
  boards: Record<TownId, Board>;
}

/* el que necessita un tauler per pintar-se, ja filtrat pel rol */
export interface BoardView {
  rev: number;
  role: Role;
  town: TownId;
  tracked: string | null;
  party: Party;
  quests: (Quest | PlayerQuest)[];
  ecos: Eco[];
  places: Record<string, string>;
  layout: Record<string, Pose>;
}

/* ---------- cossos de les peticions ---------- */
const editable = {
  cat: z.enum(CATEGORIES),
  title: text(LIMITS.title),
  text: text(LIMITS.long),
  reward: text(LIMITS.short),
  who: text(LIMITS.short),
  giver: text(LIMITS.short),
  where: text(LIMITS.short),
  note: text(LIMITS.long)
};

/* el tauler s'obre sense contrasenya (sessió de jugador); només el permís de DM en demana */
export const LoginBody = z
  .object({
    role: z.enum(ROLES),
    password: z.string().max(200).optional(),
    label: z.string().max(100).optional()
  })
  .refine((b) => b.role !== 'dm' || !!b.password, { path: ['password'], message: 'Cal la contrasenya del DM' });

export const QuestCreateBody = z
  .object({
    id: QuestId.optional(),
    ...editable,
    hidden: z.boolean(),
    towns: TownsSchema,
    steps: z.array(z.object({ id: Id.optional(), text: text(LIMITS.short), done: z.boolean().optional() })).max(100)
  })
  .partial()
  .required({ towns: true })
  .strict();
export type QuestCreate = z.infer<typeof QuestCreateBody>;

export const QuestPatchBody = z.object(editable).partial().strict();
export type QuestPatch = z.infer<typeof QuestPatchBody>;

export const TownLinkBody = z.object({ place: z.string().max(64).nullable() }).strict();

export const StepCreateBody = z
  .object({ id: Id.optional(), text: text(LIMITS.short).default(''), done: z.boolean().default(false), after: Id.nullable().optional() })
  .strict();
export const StepPatchBody = z.object({ text: text(LIMITS.short), done: z.boolean() }).partial().strict();
export const StepOrderBody = z.object({ ids: z.array(Id).max(100) }).strict();

export const TrackedBody = z.object({ questId: QuestId.nullable() }).strict();
export const PartyPatchBody = PartySchema.partial().strict();

export const EcoCreateBody = z
  .object({ id: Id.optional(), num: z.number().int().nullable(), title: text(LIMITS.title), text: text(LIMITS.long), unlocked: z.boolean() })
  .partial()
  .strict();
export const EcoPatchBody = z
  .object({ num: z.number().int().nullable(), title: text(LIMITS.title), text: text(LIMITS.long), unlocked: z.boolean() })
  .partial()
  .strict();

export const PlaceTextBody = z.object({ text: text(LIMITS.long) }).strict();
export const LayoutPatchBody = z.object({ pieces: z.record(z.string().max(64), PoseSchema.nullable()) }).strict();
export const SnapshotCreateBody = z.object({ label: z.string().max(100).optional() }).strict();

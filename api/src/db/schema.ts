/* Taules de la base de dades. Els canvis d'estructura es fan amb `npm run db:generate -w api` (crea una migració SQL a
   src/db/migrations, que s'aplica sola en arrencar). Les migracions han de ser compatibles amb la versió anterior de
   l'API: l'actualització automàtica migra abans de canviar de versió i, si la nova falla, torna a l'anterior. */

import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, serial, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import type { ChangeItem, Pose } from '@mina/model';

/* una sola fila: la missió seguida, el grup i el número de revisió (puja a cada canvi) */
export const campaign = pgTable('campaign', {
  id: smallint('id').primaryKey().default(1),
  rev: bigint('rev', { mode: 'number' }).notNull().default(0),
  trackedQuestId: text('tracked_quest_id'),
  partyLevel: integer('party_level').notNull().default(1),
  partyTitle: text('party_title').notNull().default('')
});

export const towns = pgTable('towns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull()
});

export const quests = pgTable('quests', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(1),
  position: integer('position').notNull(),
  cat: text('cat').notNull(),
  title: text('title').notNull().default(''),
  text: text('text').notNull().default(''),
  reward: text('reward').notNull().default(''),
  who: text('who').notNull().default(''),
  giver: text('giver').notNull().default(''),
  whereText: text('where_text').notNull().default(''),
  special: text('special'),
  status: text('status').notNull().default('active'),
  doneAt: bigint('done_at', { mode: 'number' }),
  hidden: boolean('hidden').notNull().default(true),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /* esborrat suau: «desfer» la pot recuperar */
  deletedAt: timestamp('deleted_at', { withTimezone: true })
});

/* taulers on surt cada missió i el seu lloc al mapa de cadascun */
export const questTowns = pgTable(
  'quest_towns',
  {
    questId: text('quest_id').notNull().references(() => quests.id, { onDelete: 'cascade' }),
    townId: text('town_id').notNull().references(() => towns.id),
    placeId: text('place_id'),
    position: integer('position').notNull()
  },
  (t) => [primaryKey({ columns: [t.questId, t.townId] })]
);

export const questSteps = pgTable(
  'quest_steps',
  {
    id: text('id').primaryKey(),
    questId: text('quest_id').notNull().references(() => quests.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull().default(''),
    done: boolean('done').notNull().default(false)
  },
  (t) => [index('quest_steps_quest_idx').on(t.questId)]
);

export const ecos = pgTable('ecos', {
  id: text('id').primaryKey(),
  num: integer('num'),
  position: integer('position').notNull(),
  title: text('title').notNull().default(''),
  text: text('text').notNull().default(''),
  unlocked: boolean('unlocked').notNull().default(false)
});

/* textos dels llocs que el DM ha canviat (la resta són els de @mina/model) */
export const boardPlaces = pgTable(
  'board_places',
  {
    townId: text('town_id').notNull().references(() => towns.id),
    placeId: text('place_id').notNull(),
    text: text('text').notNull()
  },
  (t) => [primaryKey({ columns: [t.townId, t.placeId] })]
);

/* peces col·locades a mà: el mapa, la pila o el paper d'una missió */
export const boardLayout = pgTable(
  'board_layout',
  {
    townId: text('town_id').notNull().references(() => towns.id),
    piece: text('piece').notNull(),
    pose: jsonb('pose').$type<Pose>().notNull()
  },
  (t) => [primaryKey({ columns: [t.townId, t.piece] })]
);

/* historial: cada canvi amb l'estat d'abans i el de després de cada element, per desfer-lo i per reenviar-lo */
export const changes = pgTable(
  'changes',
  {
    rev: bigint('rev', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    action: text('action').notNull(),
    summary: text('summary').notNull(),
    role: text('role').notNull(),
    sessionId: text('session_id'),
    items: jsonb('items').$type<ChangeItem[]>().notNull(),
    /* revisió del canvi que l'ha desfet */
    undoneBy: bigint('undone_by', { mode: 'number' })
  },
  (t) => [index('changes_at_idx').on(t.at)]
);

export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason').notNull(),
  label: text('label').notNull().default(''),
  rev: bigint('rev', { mode: 'number' }).notNull(),
  data: jsonb('data').notNull()
});

/* hash scrypt de cada contrasenya (només es canvien amb la CLI) */
export const credentials = pgTable('credentials', {
  role: text('role').primaryKey(),
  hash: text('hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/* dispositius amb sessió: només es desa el hash de la clau */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role').notNull(),
    label: text('label').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /* fins quan dura el permís de DM (després la sessió torna a ser de jugador) */
    dmUntil: timestamp('dm_until', { withTimezone: true })
  },
  (t) => [index('sessions_expires_idx').on(t.expiresAt)]
);


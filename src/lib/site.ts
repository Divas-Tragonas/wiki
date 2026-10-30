import type { CollectionEntry } from 'astro:content';

export const SITE_NAME = 'La Mina Perduda del Phentanilo';
export const SITE_DESCRIPTION = `Wiki de la campanya D&D ${SITE_NAME}`;

/* El lloc viu sota `base` (/wiki): tots els enllaços interns han de passar per aquí. */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const url = (path = '') => `${BASE}/${path.replace(/^\//, '')}`;

export const routes = {
  home: url(),
  wiki: url('wiki'),
  characters: url('wiki/characters'),
  places: url('wiki/places'),
  croniques: url('croniques'),
  missions: url('missions/'),
  character: (id: string) => url(`wiki/characters/${id}`),
  place: (id: string) => url(`wiki/places/${id}`),
  cronica: (id: string) => url(`croniques/${id}`),
};

type Character = CollectionEntry<'characters'>;
type Place = CollectionEntry<'places'>;
type Cronica = CollectionEntry<'croniques'>;

export const STATUS_LABEL = {
  ally: 'Aliat',
  neutral: 'Neutral',
  active: 'Actiu',
  defeated: 'Derrotat',
  unknown: 'Desconegut',
} satisfies Record<Character['data']['status'], string>;

export const CHARACTER_TYPE_LABEL = {
  creature: 'Criatura',
  humanoid: 'Humanoide',
  faction: 'Facció',
  undead: 'No-mort',
  fiend: 'Infernal',
  other: 'Altre',
} satisfies Record<NonNullable<Character['data']['type']>, string>;

export const PLACE_TYPE_LABEL = {
  city: 'Ciutat',
  dungeon: 'Masmorra',
  forest: 'Bosc',
  ruin: 'Ruïnes',
  region: 'Regió',
  other: 'Altre',
} satisfies Record<Place['data']['type'], string>;

/* Les dates del frontmatter són dies sense hora (UTC): es formaten en UTC perquè no canviïn de dia segons on es construeix. */
export const formatDate = (date: Date) =>
  date.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const sessionTitle = (c: Cronica) => `Sessió ${c.data.session}: ${c.data.title}`;

export const byName = (a: Character | Place, b: Character | Place) => a.data.name.localeCompare(b.data.name, 'ca');
export const bySessionDesc = (a: Cronica, b: Cronica) => b.data.session - a.data.session;

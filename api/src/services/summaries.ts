/* Resum en català de cada canvi, per a l'historial del DM. */
import type { ChangeItem, Quest } from '@mina/model';

const firstQuest = (items: ChangeItem[]): Quest | null => {
  for (const it of items) if (it.kind === 'quest') return (it.after || it.before) as Quest | null;
  return null;
};
const named = (items: ChangeItem[]) => {
  const q = firstQuest(items);
  return q ? `«${q.title || 'Sense títol'}»` : '';
};

const TEXTS: Record<string, (items: ChangeItem[]) => string> = {
  'quest.create': (i) => `Nova missió ${named(i)}`,
  'quest.update': (i) => `Canvis a ${named(i)}`,
  'quest.complete': (i) => `Completada ${named(i)}`,
  'quest.reopen': (i) => `Reoberta ${named(i)}`,
  'quest.hide': (i) => `Amagada ${named(i)}`,
  'quest.reveal': (i) => `Revelada ${named(i)}`,
  'quest.delete': (i) => `Eliminada ${named(i)}`,
  'quest.link': (i) => `${named(i)} a un altre tauler`,
  'quest.unlink': (i) => `${named(i)} fora d’un tauler`,
  'step.add': (i) => `Objectiu nou a ${named(i)}`,
  'step.update': (i) => `Objectiu de ${named(i)}`,
  'step.delete': (i) => `Objectiu tret de ${named(i)}`,
  'step.order': (i) => `Ordre dels objectius de ${named(i)}`,
  'tracked.set': () => 'Missió seguida',
  'party.update': () => 'Dades del grup',
  'eco.create': () => 'Eco nou',
  'eco.update': (i) => {
    const e = i.find((x) => x.kind === 'eco');
    const after = e && (e.after as { unlocked?: boolean; num?: number | null } | null);
    return after ? `Eco ${after.num ?? ''} ${after.unlocked ? 'recuperat' : 'canviat'}`.replace('  ', ' ') : 'Eco';
  },
  'eco.delete': () => 'Eco tret',
  'place.set': (i) => `Text del lloc ${i[0]?.id.split('/')[1] ?? ''}`,
  'place.reset': (i) => `Text original del lloc ${i[0]?.id.split('/')[1] ?? ''}`,
  'layout.update': (i) => (i.length === 1 ? `Peça moguda (${i[0].id.split('/')[1]})` : `${i.length} peces mogudes`),
  'import.merge': () => 'Missions importades a un tauler',
  'import.replace': () => 'Còpia sencera importada',
  'snapshot.restore': () => 'Còpia restaurada',
  undo: () => 'Canvi desfet'
};

export const describe = (action: string) => (items: ChangeItem[]) => (TEXTS[action] || (() => action))(items);

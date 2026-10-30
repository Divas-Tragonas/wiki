/* Estat de les missions (el que es desa xifrat a data.json) i la part que en veuen els jugadors. */
import { clone } from './util.js';

export const CATS = {
  principal: { label: 'Missió principal', short: 'Principal', color: 'red' },
  secundaria: { label: 'Missió secundària', short: 'Secundària', color: 'green' },
  personal: { label: 'Missió personal', short: 'Personal', color: 'indigo' }
};
export const catOf = (q) => (CATS[q.cat] ? q.cat : 'secundaria');
export const isDone = (q) => q.status === 'done';
/* «Encàrrec de Sildar», però «Una veu misteriosa» o «Oghma» es deixen tal com són */
export const giverLine = (g) => (!g ? '' : /^(una|un|la|el|les|els|decisi|ell|oghma)/i.test(g) ? g : 'Encàrrec de ' + g);

const obj = (o) => (o && typeof o === 'object' ? o : {});

/* Completa i migra un estat: s'aplica a tot el que es carrega o s'importa.
   - boards: posicions dels papers (layout) i textos dels llocs (places) de cada tauler; abans només hi havia
     Phentanil i eren a l'arrel.
   - quests[].towns: taulers on surt la missió · quests[].at: el seu lloc al mapa de cada tauler (abans, place). */
export function normState(s) {
  s = s || {};
  s.quests = Array.isArray(s.quests) ? s.quests : [];
  s.ecos = Array.isArray(s.ecos) ? s.ecos : [];
  s.boards = obj(s.boards);
  if (s.layout || s.places) {
    const b = s.boards.phentanil = obj(s.boards.phentanil);
    b.layout = b.layout || s.layout;
    b.places = b.places || s.places;
  }
  delete s.layout;
  delete s.places;
  Object.values(s.boards).forEach((b) => { b.layout = obj(b.layout); b.places = obj(b.places); });
  s.party = s.party || { level: 1, title: '' };
  s.quests.forEach((q) => {
    q.steps = Array.isArray(q.steps) ? q.steps : [];
    q.status = q.status || 'active';
    if (!Array.isArray(q.towns) || !q.towns.length) q.towns = ['phentanil'];
    q.at = obj(q.at);
    if (q.place && !q.at.phentanil) q.at.phentanil = q.place;
    delete q.place;
  });
  return s;
}

/* El que veu el grup: sense missions ocultes, notes del DM, ecos per recuperar ni posicions de papers ocults. */
export function publicView(s) {
  const o = clone(s);
  o.quests = o.quests.filter((q) => !q.hidden).map((q) => { delete q.note; return q; });
  o.ecos = o.ecos.map((e) => (e.unlocked ? e : { id: e.id, num: e.num, unlocked: false }));
  if (o.tracked && !o.quests.some((q) => q.id === o.tracked)) o.tracked = null;
  const visible = (k) => k === 'map' || k === 'pile' || o.quests.some((q) => q.id === k);
  Object.values(o.boards).forEach((b) => { b.layout = Object.fromEntries(Object.entries(b.layout).filter(([k]) => visible(k))); });
  return o;
}

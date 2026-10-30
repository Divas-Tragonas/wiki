/* Geometria del tauler: l'escenari fa 1920×1080 i es reescala a la finestra.
   Cada paper és el document sencer (W×H) vist a escala s al seu lloc (w×h) del tauler. */
import { hashOf } from './util.js';
import { catOf, isDone } from './data.js';
import { TOWN } from './towns.js';

export const STAGE_W = 1920, STAGE_H = 1080;

/* textures de paper: proporció i marges segurs (vores estripades) en fracció [dalt, dreta, baix, esquerra];
   les «r» són les mateixes girades per als papers apaisats */
export const PAPER = {
  1: { ar: 0.707, i: [0.01, 0.01, 0.011, 0.023] }, '1r': { ar: 1.414, i: [0.023, 0.01, 0.01, 0.011] },
  2: { ar: 0.733, i: [0.016, 0.033, 0.011, 0.022] }, '2r': { ar: 1.365, i: [0.022, 0.016, 0.033, 0.011] },
  3: { ar: 0.715, i: [0.012, 0.025, 0.014, 0.015] }, '3r': { ar: 1.399, i: [0.015, 0.012, 0.025, 0.014] },
  4: { ar: 0.701, i: [0.005, 0.007, 0.005, 0.007] }, '4r': { ar: 1.426, i: [0.007, 0.005, 0.007, 0.005] },
  5: { ar: 0.734, i: [0.01, 0.012, 0.011, 0.015] }, '5r': { ar: 1.362, i: [0.015, 0.01, 0.012, 0.011] },
  6: { ar: 0.687, i: [0.033, 0.033, 0.023, 0.033] }, '6r': { ar: 1.455, i: [0.033, 0.033, 0.033, 0.023] },
  7: { ar: 0.509, i: [0.019, 0.033, 0.024, 0.037] }
};
const TEX = { principal: ['2', '6', '3', '5'], secundaria: ['1', '3', '5', '4', '2'], personal: ['4', '1', '5'] };

/* mapa a dalt a l'esquerra i pila de completades a sota; el DM els pot moure (layout.map / layout.pile) */
export const MAP_HOME = { x: 28, y: 22, w: 1100, h: TOWN.h, r: -0.8 };
export const PILE_HOME = { x: 60, y: 655, w: 285, h: 398, r: -2 };

/* llocs dels cartells, copiats del tauler de referència (cx, cy: centre; z: ordre de pila) */
const SLOTS = [
  { id: 'B1', cx: 486, cy: 766, w: 450, h: 600, r: 3.5, z: 40 }, { id: 'R1', cx: 1310, cy: 320, w: 346, h: 513, r: -2.2, z: 38 },
  { id: 'B5', cx: 1081, cy: 832, w: 342, h: 427, r: -3, z: 42 }, { id: 'R3', cx: 1505, cy: 755, w: 360, h: 513, r: 1.2, z: 33 },
  { id: 'R2', cx: 1665, cy: 280, w: 378, h: 531, r: 2.2, z: 34 }, { id: 'R4', cx: 1677, cy: 850, w: 315, h: 441, r: 1, z: 44 },
  { id: 'B3', cx: 779, cy: 843, w: 195, h: 317, r: 1, z: 31 }, { id: 'R5', cx: 1801, cy: 680, w: 198, h: 225, r: 2.5, z: 30 },
  { id: 'B4', cx: 849, cy: 957, w: 108, h: 206, r: 0.5, z: 46 }
];
/* el lloc de la pila, lliure mentre no hi ha cap missió completada */
const SLOT_B2 = { id: 'B2', cx: 202, cy: 854, w: 285, h: 398, r: -2, z: 29 };
/* quan s'acaben els llocs: papers més petits per sobre dels altres */
const OVERFLOW = [
  { cx: 1215, cy: 760, w: 230, h: 300, r: -6, z: 36 }, { cx: 1480, cy: 985, w: 260, h: 170, r: 4, z: 39 },
  { cx: 640, cy: 1000, w: 220, h: 150, r: -4, z: 43 }, { cx: 1180, cy: 160, w: 170, h: 240, r: 7, z: 37 },
  { cx: 1460, cy: 585, w: 210, h: 260, r: -3, z: 35 }, { cx: 905, cy: 640, w: 190, h: 240, r: 5, z: 41 },
  { cx: 1845, cy: 1000, w: 150, h: 150, r: -5, z: 45 }, { cx: 1880, cy: 520, w: 150, h: 200, r: 6, z: 28 },
  { cx: 1020, cy: 560, w: 180, h: 150, r: -7, z: 39 }, { cx: 330, cy: 560, w: 170, h: 210, r: -5, z: 39 }
];
/* llocs preferits de cada tipus de missió, per ordre */
const SLOT_PREF = {
  principal: ['B1', 'R1', 'B5', 'R3', 'R2', 'R4', 'B3', 'B2', 'R5', 'B4'],
  personal: ['R5', 'B3', 'B4', 'B2', 'R4', 'R2'],
  secundaria: ['R2', 'R4', 'B3', 'B4', 'R5', 'B2', 'R3', 'B5', 'R1', 'B1']
};

/* focus i hover: el paper creix i es redreça molt poc */
export const FOCUS_SCALE = 1.022, FOCUS_SCALE_MAP = 1.006, FOCUS_ROT = 0.8;
export const MAP_ZOOM = 1.27;
/* zoom màxim amb la roda, sobre la mida ampliada */
export const VIEW_ZOOM_MAX = 3;

/* centre que manté tot el paper (girat) dins del tauler */
function clampCenter(cx, cy, w, h, r) {
  const a = Math.abs(r) * Math.PI / 180, m = 10;
  const bw = w * Math.cos(a) + h * Math.sin(a), bh = w * Math.sin(a) + h * Math.cos(a);
  return [Math.max(bw / 2 + m, Math.min(STAGE_W - bw / 2 - m, cx)), Math.max(bh / 2 + m, Math.min(STAGE_H - bh / 2 - m, cy))];
}

/* mida completa del document segons la proporció del lloc; al tauler es veu a escala s.
   Els llocs automàtics tenen un gir lleuger propi de cada missió; els que ha posat el DM (fixed) no. */
export function geomOf(id, sl) {
  const r = sl.fixed ? sl.r : sl.r + ((hashOf(id, 131) % 9) - 4) * 0.15;
  const [cx, cy] = sl.fixed ? [sl.cx, sl.cy] : clampCenter(sl.cx, sl.cy, sl.w, sl.h, r);
  const ar = sl.w / sl.h;
  let H = 960, W = H * ar;
  if (W > 1240) { W = 1240; H = W / ar; }
  W = Math.round(W); H = Math.round(H);
  return { cx, cy, w: sl.w, h: sl.h, x: cx - sl.w / 2, y: cy - sl.h / 2, W, H, s: sl.w / W, r, z: sl.z };
}

/* on va a parar el document d'una missió completada: a sobre de la pila (pile: posició actual de la pila) */
export const pileGeom = (id, pile) =>
  geomOf(id, { cx: pile.x + pile.w / 2, cy: pile.y + pile.h / 2, w: pile.w, h: pile.h, r: pile.r, z: 30 });

/* posició de x/y (el document escala des del centre) perquè el paper quedi al seu lloc */
export const homeOf = (g) => ({ x: g.cx - g.W / 2, y: g.cy - g.H / 2 });

/* desplaçament horitzontal per treure un paper del tauler cap al costat més proper */
export function scatterX(it) {
  const cx = it.x + it.w / 2;
  return cx < STAGE_W / 2 ? -(cx + it.w / 2 + 160) : (STAGE_W - cx + it.w / 2 + 160);
}
/* gir que acompanya el paper quan surt del tauler */
export const scatterRot = (it) => (it.x + it.w / 2 < STAGE_W / 2 ? -7 : 7);

/* textura segons la proporció del paper i el tipus de missió */
export function texFor(q, g) {
  const ar = g.W / g.H;
  if (ar < 0.6) return '7';
  const list = TEX[catOf(q)], t = list[hashOf(q.id, 17) % list.length];
  return ar > 1.12 ? t + 'r' : t;
}

/* Reparteix les missions visibles pels llocs del tauler: principals (la seguida primer), personals i secundàries.
   Les completades van a la pila. Els papers que el DM ha col·locat a mà (manual[id]) no ocupen cap lloc automàtic. */
export function layoutBoard(visible, tracked, manual) {
  const act = visible.filter((q) => !isDone(q));
  const done = visible.filter(isDone).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const ofCat = (c) => act.filter((q) => catOf(q) === c);
  const prin = ofCat('principal').sort((p, q) => (q.id === tracked) - (p.id === tracked));
  const quests = prin.concat(ofCat('personal'), ofCat('secundaria'));
  const free = SLOTS.slice();
  if (!done.length) free.push(SLOT_B2);
  const over = OVERFLOW.slice(), slots = {};
  quests.forEach((q, n) => {
    const P = manual[q.id];
    if (P) {
      slots[q.id] = geomOf(q.id, { cx: P.cx, cy: P.cy, w: P.w || 285, h: P.h || 398, r: P.r || 0, z: P.z || 40, fixed: true });
      return;
    }
    let sl = null;
    for (const sid of SLOT_PREF[catOf(q)]) {
      const k = free.findIndex((f) => f.id === sid);
      if (k >= 0) { sl = free.splice(k, 1)[0]; break; }
    }
    if (!sl && free.length) sl = free.shift();
    if (!sl) sl = over.shift() || { cx: 1200 + (hashOf(q.id, 7) % 680), cy: 120 + (hashOf(q.id, 131) % 860), w: 170, h: 210, r: (hashOf(q.id, 3) % 13) - 6, z: 50 + n };
    slots[q.id] = geomOf(q.id, sl);
  });
  const ids = quests.map((q) => q.id);
  return { slots, ids, done, order: ids.concat(done.map((q) => q.id)) };
}

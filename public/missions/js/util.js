/* Utilitats sense estat compartides per tot el tauler. */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
export const clone = (o) => JSON.parse(JSON.stringify(o));

export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/* factor de les durades: amb moviment reduït totes les animacions passen gairebé a l'instant */
export const D = REDUCED_MOTION ? 0.01 : 1;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms * D));

/* hash estable (FNV-1a) per donar a cada missió gir, textura i encapçalament propis sense desar-los */
export function hashOf(s, m = 0) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h + m * 7919) % 100003;
}

export const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
export const rad = (deg) => deg * Math.PI / 180;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* minúscules, sense espais de més (contrasenyes i comparació de títols) */
export const normText = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
/* clau per comparar títols: sense accents ni signes */
export const titleKey = (t) => normText(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* Text d'un camp editable tal com s'ha escrit. No serveix innerText: dona el text com es veu, i el títol i la
   recompensa del paper es mostren en majúscules (text-transform), així que es desarien en majúscules. */
export function plainText(el) {
  let out = '';
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.data;
      else if (c.nodeName === 'BR') out += '\n';
      else {
        if ((c.nodeName === 'DIV' || c.nodeName === 'P') && out && !out.endsWith('\n')) out += '\n';
        walk(c);
      }
    }
  };
  walk(el);
  return out.replace(/\u00a0/g, ' ');
}

/* píxels de desplaçament d'un esdeveniment de roda, sigui quin sigui el mode */
export const wheelPixels = (e) => e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 600 : 1);

export const closestIn = (target, sel) => (target && target.closest ? target.closest(sel) : null);

/* posa el cursor dins d'un camp editable: tot seleccionat o al final */
export function placeCaret(el, selectAll) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  if (!selectAll) r.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

/* el punt més proper en una direcció (fletxes o comandament): avançar compta, desviar-se de costat penalitza */
export function nearestInDirection(points, cur, dx, dy, minAlong) {
  let best = null, bestScore = Infinity;
  for (const p of points) {
    if (p === cur) continue;
    const vx = p.x - cur.x, vy = p.y - cur.y, along = vx * dx + vy * dy;
    if (along <= minAlong) continue;
    const score = along + Math.abs(vx * dy - vy * dx) * 2.2;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function storage(area) {
  return {
    get(k) { try { return JSON.parse(area().getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { area().setItem(k, JSON.stringify(v)); } catch (e) { /* sense espai o sense permís */ } },
    del(k) { try { area().removeItem(k); } catch (e) { /* idem */ } }
  };
}
export const local = storage(() => localStorage);
export const session = storage(() => sessionStorage);

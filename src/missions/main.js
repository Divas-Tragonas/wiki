/* Tauler de missions · La Mina Perduda del Phentanilo
   - Les missions són a l'API de la Mac mini (api/ al repositori): el tauler entra amb la contrasenya del grup, carrega
     el tauler del seu poble i rep els canvis en directe. La pàgina és src/pages/missions/index.astro.
   - Cada paper del tauler és el document sencer a escala; en clicar-lo s'acosta el mateix paper.
   - El mode DM edita els mateixos papers: cada canvi es veu de seguida i s'envia a l'API (remote.js). */
import { gsap } from 'gsap';
import { newId } from '@mina/model/ids';
import { $, $$, D, clamp, clone, closestIn, esc, gp, hashOf, local, nearestInDirection, num, placeCaret, plainText, rad, session, wait, wheelPixels } from './util.js';
import * as api from './api.js';
import * as remote from './remote.js';
import { CATS, catOf, giverLine, isDone } from './data.js';
import { TOWNS } from './towns.js';
import { PLACES, TOWN, TOWN_ID } from './current-town.js';
import { routes, SITE_NAME } from '../lib/site';
import {
  FOCUS_ROT, FOCUS_SCALE, FOCUS_SCALE_MAP, MAP_HOME, MAP_ZOOM, PAPER, PILE_HOME, STAGE_H, STAGE_W, VIEW_ZOOM_MAX,
  homeOf, layoutBoard, paperUrl, pileGeom, scatterRot, scatterX, shadowUrl, texFor
} from './layout.js';
import { cycleFx, initFx, liftTo, setHoleSource } from './light.js';
import { fatal, fit, stage, toStage, toast } from './ui.js';
import { askGate, gateOpen } from './gate.js';
import { askViewer, pixelOn, toBoard, toPixel } from './pixel.js';

/* =================================================================== elements */
const E = {
  shell: $('#shell'), docs: $('#docs'), map: $('#bmap'), mapImg: $('#mapImg'), labels: $('#labels'),
  pile: $('#pile'), pileN: $('#pileN'), dim: $('#dim'), pcard: $('#pcard'), dmcard: $('#dmcard'), dmbar: $('#dmbar'),
  zp: $('#zp'), hint: $('#hint'), chrome: $('#chrome'), rhandle: $('#rhandle'), impFile: $('#impFile'),
  dmBtn: $('#dmBtn'), fsBtn: $('#fsBtn'), fxBtn: $('#fxBtn'), net: $('#net'), hist: $('#hist')
};

/* =================================================================== estat */
/* el tauler d'aquest poble: { rev, quests, ecos, tracked, party, boards: { [poble]: { layout, places } } } */
let state = null;
let board = null;    // repartiment actual del tauler (layoutBoard)
let role = 'player'; // rol de la sessió: qui és DM pot tenir el mode DM tancat
let dmOn = false;    // mode DM obert en aquesta pantalla
let readOnly = false; // tauler de la còpia local: el servidor no respon
/* focus: peça triada (id, 'map' o 'pile') · zoom: el que està ampliat · zEl: el seu element ·
   place/card: lloc marcat i fitxa oberta sobre el mapa */
const view = { focus: null, zoom: null, zEl: null, place: null, card: null };
const docs = new Map();   // id → element del paper
let inputKind = 'kb';     // kb | mouse | pad: quines indicacions es mostren

/* posició actual del mapa i la pila (la de sempre o la que ha triat el DM) */
const MAP = Object.assign({}, MAP_HOME);
const PILE = Object.assign({}, PILE_HOME);

const boardData = () => state.boards[TOWN_ID] || (state.boards[TOWN_ID] = { layout: {}, places: {} });
const qById = (id) => state.quests.find((q) => q.id === id);
const onBoard = (q) => Object.prototype.hasOwnProperty.call(q.towns, TOWN_ID);
const canSee = (q) => onBoard(q) && (dmOn || !q.hidden);
const isPiece = (key) => key === 'map' || key === 'pile';

/* =================================================================== arrencada */
async function fontsReady() {
  if (!document.fonts) return;
  const loads = ['60px Antiquarian', '30px "Antiquarian Scribe"', '27px Alegreya', 'italic 27px Alegreya'].map((f) => document.fonts.load(f).catch(() => null));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 3500))]);
}
const fromView = (v) => ({ rev: v.rev, quests: v.quests, ecos: v.ecos, tracked: v.tracked, party: v.party, boards: { [TOWN_ID]: { layout: v.layout, places: v.places } } });
const toView = () => ({ rev: state.rev, role, town: TOWN_ID, tracked: state.tracked, party: state.party, quests: state.quests, ecos: state.ecos, places: boardData().places, layout: boardData().layout });

async function fetchBoard() {
  const v = await api.request('GET', `/v1/boards/${TOWN_ID}`);
  role = v.role;
  remote.saveCache(v);
  return v;
}
const loginError = (e) => (e instanceof api.ApiError && e.status && e.status < 500 ? e.message : api.isOffline(e) ? 'No hi ha connexió amb el servidor de missions' : e.message);

async function start() {
  fit();
  addEventListener('resize', fit);
  initFx();
  /* restes del tauler d'abans de l'API: claus de data.json i la clau de GitHub (la feina sense publicar, phx.work, es
     deixa: si n'hi havia, encara es pot recuperar des de les eines del navegador) */
  ['phx.kp', 'phx.gh'].forEach((k) => local.del(k));
  session.del('phx.kd');
  if (!api.apiConfigured()) { fatal('El tauler no sap on és el servidor de missions (falta PUBLIC_MISSIONS_API_URL en fer el build).'); return; }
  let v;
  try {
    if (!(await api.getSession())) {
      await askGate({
        kicker: 'Diari de ' + TOWN.name, title: 'Tauler de missions', text: 'Escriu la contrasenya del grup per entrar.', ph: 'Contrasenya', btn: 'Entrar', back: true,
        check: async (pw) => {
          try { await api.login('player', pw); return null; } catch (e) { return loginError(e); }
        }
      });
    }
    v = await fetchBoard();
  } catch (e) {
    const cached = api.isOffline(e) && remote.loadCache(TOWN_ID);
    if (!cached) {
      fatal(api.isOffline(e) ? 'No hi ha connexió amb el servidor de missions. Es tornarà a provar en uns segons…' : 'No s’ha pogut carregar el tauler: ' + e.message);
      if (api.isOffline(e)) setTimeout(() => location.reload(), 10_000);
      return;
    }
    v = cached.view;
    readOnly = true;
  }
  state = fromView(v);
  remote.configure({ onStatus: updateStat, onRejected: writeRejected, onAuthLost: authLost });
  await fontsReady();
  initBoard();
  connect();
  if (readOnly) setNet('offline');
}

/* =================================================================== en directe */
let unsubscribe = null, netT = null, cacheT = null;
function connect() {
  if (unsubscribe) unsubscribe();
  unsubscribe = api.subscribe(TOWN_ID, {
    since: () => state.rev,
    onChange: applyChange,
    onState: (s) => {
      setNet(s);
      /* tornava de la còpia local: ara que hi ha servidor, el tauler de veritat (i del rol que toca) */
      if (s === 'live' && readOnly) reloadBoard();
    },
    onAuth: authLost
  });
}
/* avís discret de connexió: només si fa uns segons que no n'hi ha */
function setNet(s) {
  clearTimeout(netT);
  if (s === 'live') { E.net.hidden = true; return; }
  netT = setTimeout(() => {
    E.net.textContent = readOnly ? 'Sense connexió amb el servidor · tauler guardat, només per mirar' : 'Sense connexió amb el servidor · es torna a provar';
    E.net.hidden = false;
  }, readOnly ? 0 : 3000);
}
function saveCacheSoon() {
  clearTimeout(cacheT);
  cacheT = setTimeout(() => remote.saveCache(toView()), 1000);
}
async function reloadBoard() {
  await remote.whenIdle();
  let v;
  try { v = await fetchBoard(); } catch (e) {
    if (!api.isOffline(e)) toast('No s’ha pogut tornar a carregar el tauler: ' + e.message, 4200);
    return;
  }
  readOnly = false;
  state = fromView(v);
  setNet('live');
  afterStateChange();
}
/* després d'un canvi gran (recàrrega, canvi de rol): el tauler, el paper obert i les fitxes al dia */
function afterStateChange() {
  if (view.zoom && view.zoom !== 'map') {
    const q = qById(view.zoom);
    if (!q || !canSee(q)) closeDoc();
  }
  renderBoard(true);
  if (view.zEl) { const q = qById(view.zEl.dataset.id); if (q) applyDoc(view.zEl, q, view.zEl._g); renderDmCard(); }
  if (view.card) openCard(view.card);
  renderDmBar();
}

/* un canvi de l'API: el que el tauler encara té per enviar (remote.busy) no es toca, és més nou */
function applyChange(rev, events) {
  if (rev <= state.rev) return;
  state.rev = rev;
  let render = false;
  const touched = new Set();
  for (const ev of events) {
    switch (ev.type) {
      case 'quest.upserted': {
        const q = ev.quest, cur = qById(q.id);
        if (remote.busy('quest:' + q.id) || (cur && cur.version >= q.version)) break;
        if (cur) Object.keys(cur).forEach((k) => { if (!(k in q)) delete cur[k]; });
        if (cur) Object.assign(cur, q); else state.quests.push(q);
        state.quests.sort((a, b) => a.position - b.position);
        touched.add(q.id);
        render = true;
        break;
      }
      case 'quest.removed':
        if (remote.busy('quest:' + ev.id) || !qById(ev.id)) break;
        state.quests = state.quests.filter((q) => q.id !== ev.id);
        if (view.zoom === ev.id) closeDoc();
        render = true;
        break;
      case 'eco.changed': {
        if (remote.busy('eco:' + ev.eco.id)) break;
        const i = state.ecos.findIndex((e) => e.id === ev.eco.id);
        if (i >= 0) state.ecos[i] = ev.eco; else state.ecos.push(ev.eco);
        state.ecos.sort((a, b) => a.position - b.position);
        render = true;
        break;
      }
      case 'eco.removed':
        state.ecos = state.ecos.filter((e) => e.id !== ev.id);
        render = true;
        break;
      case 'place.changed':
        if (remote.busy('place:' + ev.place)) break;
        if (ev.text === null) delete boardData().places[ev.place]; else boardData().places[ev.place] = ev.text;
        if (view.card === ev.place && !E.pcard.contains(document.activeElement)) openCard(ev.place);
        break;
      case 'layout.changed':
        for (const [piece, pose] of Object.entries(ev.pieces)) {
          if (remote.busy('layout:' + piece)) continue;
          if (pose === null) delete boardData().layout[piece]; else boardData().layout[piece] = pose;
        }
        render = true;
        break;
      case 'tracked.changed':
        if (!remote.busy('tracked')) { state.tracked = ev.tracked; render = true; }
        break;
      case 'party.changed':
        state.party = ev.party;
        break;
      case 'board.reload':
        reloadBoard();
        return;
    }
  }
  if (render && !arrange.drag) {
    renderBoard(true);
    if (view.zEl && touched.has(view.zEl.dataset.id)) {
      const q = qById(view.zEl.dataset.id);
      applyDoc(view.zEl, q, view.zEl._g);
      gsap.to(view.zEl, Object.assign({ duration: 0.4 * D, overwrite: 'auto' }, zoomTarget(view.zEl._g)));
      renderDmCard();
    }
    if (view.card) openCard(view.card);
  }
  saveCacheSoon();
}

/* =================================================================== papers */
/* contingut del document (igual al tauler i ampliat); data-f marca els camps que el DM escriu sobre el paper */
function docHTML(q, edit) {
  const c = catOf(q), steps = q.steps || [], nd = steps.filter((s) => s.done).length, cur = isDone(q) ? -1 : steps.findIndex((s) => !s.done);
  const h = [];
  if (c === 'personal') h.push(`<div class="d-to">Per a ${esc(q.who || '…')}</div>`);
  else if (c === 'principal') h.push(`<div class="d-k"><i class="st"></i><span>${CATS.principal.label}</span><i class="st"></i></div>`);
  else h.push(`<div class="d-k"><span>${q.reward ? 'Recompensa' : ['Avís', 'Es busca', 'Atenció'][hashOf(q.id, 53) % 3]}</span></div>`);
  h.push(`<h2 class="d-t" data-f="title" data-ph="Títol">${esc(q.title)}</h2>`);
  const meta = [];
  if (q.where) meta.push(`<span><b>Lloc</b>${esc(q.where)}</span>`);
  if (c !== 'secundaria' && q.giver) meta.push(`<span>${esc(giverLine(q.giver))}</span>`);
  if (meta.length) h.push(`<div class="d-m">${meta.join('')}</div>`);
  h.push('<div class="d-rule"></div>');
  if (c === 'secundaria' && (q.reward || edit)) h.push(`<div class="d-r"><b data-f="reward" data-ph="Recompensa (opcional)">${esc(q.reward || '')}</b></div>`);
  if (q.text || edit) h.push(`<div class="d-x" data-f="text" data-ph="Text del cartell…">${esc(q.text || '')}</div>`);
  if (q.special === 'ecos') h.push(`<ul class="d-e">${state.ecos.map((e) => ecoHTML(e, edit)).join('')}</ul>`);
  if (steps.length || edit) {
    const items = steps.map((s, i) => `<li class="${s.done ? 'd' : ''}${i === cur ? ' cur' : ''}" data-i="${i}" data-step="${esc(s.id)}"><span class="bx"></span><span class="tx" data-f="step" data-ph="Objectiu">${esc(s.text)}</span><button type="button" class="del" data-act="delstep" tabindex="-1" title="Treure">×</button></li>`);
    h.push(`<div class="d-o"><h3><span>Objectius</span><i></i><b>${nd}/${steps.length}</b></h3><ul>${items.join('')}</ul>${edit ? '<button type="button" class="add" data-act="addstep">+ Afegir objectiu</button>' : ''}</div>`);
  }
  if (c === 'secundaria' && q.giver) h.push(`<div class="d-f">${esc(giverLine(q.giver))}</div>`);
  return h.join('');
}
/* missió especial dels ecos: els recuperats es llegeixen; el DM també veu (i desbloqueja) els altres */
function ecoHTML(e, edit) {
  const label = e.id === 'final' ? 'Final' : 'Eco ' + esc(e.num);
  const body = e.unlocked || (edit && e.title)
    ? `<strong>${esc(e.title)}.</strong> ${esc(e.text || '')}${e.unlocked ? '' : ' <em>(bloquejat)</em>'}`
    : 'No recuperat';
  return `<li class="${e.unlocked ? '' : 'lock'}" data-eco="${esc(e.id)}"><b>${label}</b><span>${body}</span></li>`;
}
/* cap el contingut si l'últim bloc acaba dins del paper (scrollHeight no serveix: les lletres de l'Antiquarian
   sobresurten de la línia i sempre marcarien uns píxels de més); --k és l'escala del text */
function fitDoc(el) {
  const inn = el.firstElementChild;
  const fits = () => { const c = inn.lastElementChild; return !c || c.offsetTop + c.offsetHeight <= inn.clientHeight + 1; };
  inn.style.setProperty('--k', 1);
  if (fits()) return;
  let lo = 0.4, hi = 1;
  for (let i = 0; i < 7; i++) {
    const k = (lo + hi) / 2;
    inn.style.setProperty('--k', k);
    if (fits()) lo = k; else hi = k;
  }
  inn.style.setProperty('--k', lo);
}
function makeDoc(q) {
  const el = document.createElement('div');
  el.className = 'doc';
  el.dataset.id = q.id;
  el.innerHTML = '<div class="doc-in"></div><div class="d-stamp">Completada</div><div class="d-hid">Oculta</div>';
  E.docs.appendChild(el);
  return el;
}
/* tot el que canvia el paper: si no canvia, no cal tornar-lo a pintar */
const docSig = (q, g, tex, edit) =>
  JSON.stringify([q.title, q.cat, q.who, q.giver, q.where, q.reward, q.text, q.steps, q.special ? state.ecos : 0, g.W, g.H, tex, edit, isDone(q)]);
/* aplica el contingut i la mida; si la mida canvia, manté el centre on era */
function applyDoc(el, q, g, force) {
  const tex = texFor(q, g), P = PAPER[tex], edit = el.classList.contains('editing'), zoomed = el.classList.contains('zoomed');
  el.className = ['doc', 'c-' + catOf(q), isDone(q) && 'done', q.hidden && 'hid', edit && 'editing', zoomed && 'zoomed', view.focus === q.id && 'focus'].filter(Boolean).join(' ');
  const old = el._g;
  if (old && (old.W !== g.W || old.H !== g.H)) gsap.set(el, { x: gp(el, 'x') + (old.W - g.W) / 2, y: gp(el, 'y') + (old.H - g.H) / 2 });
  el._g = g;
  const sig = docSig(q, g, tex, edit);
  if (force || el._sig !== sig) {
    el._sig = sig;
    el.style.width = g.W + 'px';
    el.style.height = g.H + 'px';
    el.style.setProperty('--tex', `url(${paperUrl(tex)})`);
    el.style.setProperty('--sh', `url(${shadowUrl(tex)})`);
    ['it', 'ir', 'ib', 'il'].forEach((k, i) => el.style.setProperty('--' + k, P.i[i]));
    el.firstElementChild.innerHTML = docHTML(q, edit);
    if (edit) setEditable(el, true);
    fitDoc(el);
  }
  /* --is: inversa de l'escala, perquè les marques de focus tinguin la mateixa mida a tots els papers */
  if (!zoomed) el.style.setProperty('--is', (1 / g.s).toFixed(3));
}
/* el paper fa cap a la pila i, si cal, desapareix */
function flyToPile(el, duration, ease, fade) {
  const g = pileGeom(el.dataset.id, PILE), h = homeOf(g);
  const end = fade ? () => gsap.to(el, { opacity: 0, duration: fade * D, onComplete: () => el.remove() }) : () => el.remove();
  gsap.to(el, { x: h.x, y: h.y, scale: g.s, rotation: g.r + 3, duration: duration * D, ease, overwrite: 'auto', onComplete: end });
}
function renderBoard(anim) {
  applyFixed(anim);
  board = layoutBoard(state.quests.filter(canSee), state.tracked, boardData().layout);
  const seen = new Set();
  board.ids.forEach((id, n) => {
    const q = qById(id), g = board.slots[id];
    let el = docs.get(id), isNew = false;
    if (!el) { el = makeDoc(q); docs.set(id, el); isNew = true; }
    el._temp = false;
    seen.add(id);
    applyDoc(el, q, g);
    if (view.zoom === id) return;
    el.style.zIndex = view.focus === id ? 90 : g.z;
    const h = homeOf(g), foc = view.focus === id && !view.zoom;
    const tgt = {
      x: h.x + (view.zoom ? scatterX(g) : 0), y: h.y,
      scale: g.s * (foc ? FOCUS_SCALE : 1),
      rotation: foc ? g.r * FOCUS_ROT : g.r + (view.zoom ? scatterRot(g) : 0)
    };
    if (isNew || !anim) {
      gsap.set(el, Object.assign({}, tgt, { opacity: 1 }));
      if (isNew && anim) gsap.fromTo(el, { opacity: 0, y: h.y - 40 }, { opacity: 1, y: h.y, duration: 0.5 * D, ease: 'power2.out', delay: n * 0.02 * D });
    } else gsap.to(el, Object.assign({ duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto' }, tgt));
  });
  docs.forEach((el, id) => {
    if (seen.has(id) || view.zoom === id) return;
    docs.delete(id);
    const q = qById(id);
    if (q && isDone(q) && canSee(q)) {
      el.style.zIndex = 31;
      flyToPile(el, 0.55, 'power3.inOut', 0.25);
    } else gsap.to(el, { opacity: 0, y: gp(el, 'y') + 30, duration: 0.35 * D, onComplete: () => el.remove() });
  });
  E.pile.hidden = !board.done.length;
  E.pileN.textContent = board.done.length;
  if (view.focus && !itemOf(view.focus)) view.focus = null;
}
/* peces del tauler que es poden triar: mapa, pila (si n'hi ha) i papers, amb la seva geometria al tauler */
function itemList() {
  const list = [Object.assign({ key: 'map', el: E.map }, MAP)];
  if (board.done.length) list.push(Object.assign({ key: 'pile', el: E.pile }, PILE));
  board.ids.forEach((id) => { const el = docs.get(id); if (el) list.push(Object.assign({ key: id, el }, board.slots[id])); });
  return list;
}
const itemOf = (key) => itemList().find((it) => it.key === key);

/* =================================================================== focus i navegació */
function lift(key, on) {
  const it = itemOf(key);
  if (!it) return;
  it.el.classList.toggle('focus', on);
  if (!isPiece(key)) it.el.style.zIndex = on ? 90 : it.z;
  if (view.zoom) return;
  const o = { duration: 0.32 * D, ease: 'power2.out', overwrite: 'auto' };
  if (key === 'map') gsap.to(it.el, Object.assign(o, { scale: on ? FOCUS_SCALE_MAP : 1 }));
  else if (key === 'pile') gsap.to(it.el, Object.assign(o, { scale: on ? FOCUS_SCALE : 1, rotation: on ? PILE.r * FOCUS_ROT : PILE.r }));
  else gsap.to(it.el, Object.assign(o, { scale: it.s * (on ? FOCUS_SCALE : 1), rotation: on ? it.r * FOCUS_ROT : it.r }));
}
function setFocus(key) {
  if (!key || key === view.focus) return;
  if (view.focus) lift(view.focus, false);
  view.focus = key;
  lift(key, true);
}
function navDir(dx, dy) {
  const list = itemList();
  if (!view.focus) { setFocus((list.find((i) => i.key === state.tracked) || list[1] || list[0]).key); return; }
  /* el punt de referència és a dalt de cada peça: als papers alts, el centre quedaria massa avall */
  const pts = list.map((it) => ({ key: it.key, x: it.x + it.w / 2, y: it.y + Math.min(it.h, 180) / 2 }));
  const cur = pts.find((p) => p.key === view.focus);
  if (!cur) return;
  const best = nearestInDirection(pts, cur, dx, dy, 12);
  if (best) setFocus(best.key);
}
/* en obrir una peça, la resta surten del tauler cap als costats (out) o hi tornen */
function scatter(out, except) {
  itemList().forEach((it) => {
    if (it.key === except) return;
    const d = Math.abs(it.x + it.w / 2 - STAGE_W / 2) / (STAGE_W / 2), isDoc = !isPiece(it.key);
    const h = isDoc ? homeOf(it) : { x: 0, y: 0 }, s = isDoc ? it.s : 1, foc = it.key === view.focus;
    if (out) gsap.to(it.el, { x: h.x + scatterX(it), y: h.y, rotation: it.r + scatterRot(it), scale: s, duration: 0.55 * D, ease: 'power3.in', delay: (1 - d) * 0.12 * D, overwrite: 'auto' });
    else gsap.to(it.el, { x: h.x, y: h.y, rotation: foc && it.key !== 'map' ? it.r * FOCUS_ROT : it.r, scale: foc ? s * (it.key === 'map' ? FOCUS_SCALE_MAP : FOCUS_SCALE) : s, duration: 0.6 * D, ease: 'power3.out', delay: d * 0.12 * D, overwrite: 'auto' });
  });
  gsap.to(E.dim, { opacity: out ? 1 : 0, duration: 0.5 * D });
  gsap.to(E.zp, { opacity: out ? 1 : 0, duration: 0.4 * D, delay: out ? 0.5 * D : 0 });
}

/* =================================================================== paper ampliat */
/* en mode DM el paper es fa a un costat per deixar lloc a la fitxa del DM */
function zoomTarget(g) {
  const TX = dmOn ? 690 : STAGE_W / 2, TY = 532, z = Math.min(1, 990 / g.H, (dmOn ? 1150 : 1760) / g.W);
  return { x: TX - g.W / 2, y: TY - g.H / 2, scale: z, rotation: 0 };
}
const flyToZoom = (el, duration, ease = 'power3.inOut') => gsap.to(el, Object.assign({ duration: duration * D, ease, overwrite: 'auto' }, zoomTarget(el._g)));
/* el document d'una missió feta no és al tauler: surt de la pila (temporal) i hi torna en tancar-lo */
function docForZoom(id) {
  let el = docs.get(id);
  if (el) return el;
  const q = qById(id);
  if (!q) return null;
  el = makeDoc(q);
  el._temp = true;
  docs.set(id, el);
  const g = pileGeom(id, PILE), h = homeOf(g);
  applyDoc(el, q, g);
  el.style.zIndex = 31;
  gsap.set(el, { x: h.x, y: h.y, scale: g.s, rotation: g.r + 3, opacity: 1 });
  return el;
}
function flyIn(el) {
  el.classList.add('zoomed');
  el.style.zIndex = 110;
  el.style.setProperty('--is', 2.4);
  flyToZoom(el, 0.7);
  liftTo(el, 'doc', true);
}
function showZoomed(id, el) {
  view.zoom = id;
  view.zEl = el;
  if (board.slots[id]) view.focus = id;
  flyIn(el);
  if (dmOn) enterEdit(el);
  renderPrompts();
}
function openDoc(id) {
  if (view.zoom === 'map') return closeMap().then(() => openDoc(id));
  if (view.zoom && view.zoom !== id) return swapDoc(id, 1);
  if (view.zoom === id) return Promise.resolve();
  const el = docForZoom(id);
  if (!el) return Promise.resolve();
  if (view.focus) lift(view.focus, false);
  scatter(true, id);
  showZoomed(id, el);
  return wait(700);
}
/* el paper que deixa pas a un altre torna fora del tauler (on són els altres) o a la pila */
function settleOut(el, dir) {
  const id = el.dataset.id, g = board.slots[id];
  el.classList.remove('zoomed');
  setEditing(el, false);
  if (g && !el._temp) {
    el.style.setProperty('--is', (1 / g.s).toFixed(3));
    const h = homeOf(g);
    gsap.to(el, { x: h.x + scatterX(g), y: h.y, scale: g.s, rotation: g.r + scatterRot(g), duration: 0.5 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { el.style.zIndex = g.z; } });
    return;
  }
  if (docs.get(id) === el) docs.delete(id);
  const q = qById(id);
  if (q && isDone(q)) flyToPile(el, 0.5, 'power3.inOut');
  else gsap.to(el, { x: gp(el, 'x') - dir * 1400, opacity: 0, duration: 0.45 * D, onComplete: () => el.remove() });
}
function swapDoc(id, dir) {
  const prev = view.zEl, next = docForZoom(id);
  if (!next || next === prev) return Promise.resolve();
  if (prev) { liftTo(prev, 'doc', false, 0); settleOut(prev, dir); }
  showZoomed(id, next);
  return wait(700);
}
function closeDoc() {
  const id = view.zoom, el = view.zEl;
  if (!id || id === 'map' || !el) return Promise.resolve();
  view.zoom = null;
  view.zEl = null;
  setEditing(el, false);
  hideDmCard();
  el.classList.remove('zoomed');
  const q = qById(id), g = q && canSee(q) && !isDone(q) ? board.slots[id] : null;
  liftTo(el, 'doc', false, 0.42);
  if (g && !el._temp) {
    el.style.setProperty('--is', (1 / g.s).toFixed(3));
    const h = homeOf(g);
    gsap.to(el, { x: h.x, y: h.y, scale: g.s * FOCUS_SCALE, rotation: g.r * FOCUS_ROT, duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { el.style.zIndex = view.focus === id ? 90 : g.z; } });
  } else {
    if (docs.get(id) === el) docs.delete(id);
    if (q && isDone(q) && canSee(q)) {
      flyToPile(el, 0.6, 'power3.inOut', 0.2);
      if (board.done.length) view.focus = 'pile';
    } else gsap.to(el, { opacity: 0, scale: gp(el, 'scaleX') * 0.9, duration: 0.4 * D, onComplete: () => el.remove() });
  }
  scatter(false, id);
  renderPrompts();
  return wait(650);
}
/* fletxes amb un paper obert: el següent o l'anterior, passant també per les completades */
function stepZoom(dir) {
  if (!view.zoom || view.zoom === 'map') return;
  const o = board.order, i = o.indexOf(view.zoom);
  const n = i < 0 ? o[0] : o[(i + dir + o.length) % o.length];
  if (n && n !== view.zoom) swapDoc(n, dir);
}
function openKey(key) {
  if (key === 'map') return openMap();
  if (key === 'pile') { const d = board.done[0]; return d ? openDoc(d.id) : Promise.resolve(); }
  return openDoc(key);
}
const closeAny = () => (view.zoom === 'map' ? closeMap() : closeDoc());

/* =================================================================== mapa */
function renderLabels() {
  const html = TOWN.geom.map((p) => {
    if (p.icon) {
      const [cx, cy, r] = p.icon, u = r / 62;
      return `<g class="plc" data-p="${p.id}"><circle class="hit" cx="${cx}" cy="${cy}" r="${r + 26}"/><circle class="ic" cx="${cx}" cy="${cy}" r="${r + 8}"/><circle class="icr" cx="${cx}" cy="${cy}" r="${r - 4}"/>` +
        `<circle class="icd" cx="${cx}" cy="${cy - 26 * u}" r="${9 * u}"/><path class="icd" d="M${cx - 15 * u} ${cy - 10 * u}h${22 * u}v${36 * u}h${8 * u}v${8 * u}h${-32 * u}v${-8 * u}h${8 * u}v${-28 * u}h${-6 * u}z"/></g>`;
    }
    const xs = p.ln.map((l) => l[1]), ys = p.ln.map((l) => l[2]);
    const tx0 = Math.min(...xs), tx1 = Math.max(...p.ln.map((l) => l[1] + l[3])), ty0 = Math.min(...ys) - 50, ty1 = Math.max(...ys) + 16;
    let h = `<g class="plc" data-p="${p.id}"><rect class="hit" x="${tx0 - 18}" y="${ty0 - 14}" width="${tx1 - tx0 + 36}" height="${ty1 - ty0 + 28}"/>`;
    if (p.ar) {
      /* fletxa: traç blanc gruixut a sota (h, hh) i el traç fosc a sobre (s, sh) */
      const [x1, y1, x2, y2] = p.ar, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const hl = 40, hw = 17, bx = x2 - ux * hl, by = y2 - uy * hl, sx = (x2 - ux * (hl - 4)).toFixed(1), sy = (y2 - uy * (hl - 4)).toFixed(1);
      const head = `${x2},${y2} ${(bx + px * hw).toFixed(1)},${(by + py * hw).toFixed(1)} ${(bx - px * hw).toFixed(1)},${(by - py * hw).toFixed(1)}`;
      h += `<line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
        `<line class="h" x1="${x1}" y1="${y1}" x2="${sx}" y2="${sy}"/><polygon class="hh" points="${head}"/><line class="s" x1="${x1}" y1="${y1}" x2="${sx}" y2="${sy}"/><polygon class="sh" points="${head}"/>`;
    }
    return h + p.ln.map((l) => `<text x="${l[1] + l[3] / 2}" y="${l[2]}">${esc(l[0])}</text>`).join('') + '</g>';
  });
  E.labels.setAttribute('viewBox', '0 0 ' + TOWN.vb.join(' '));
  E.labels.innerHTML = html.join('');
}
const plcEl = (id) => $(`.plc[data-p="${id}"]`, E.labels);
const questsAt = (id) => state.quests.filter((q) => canSee(q) && !isDone(q) && q.towns[TOWN_ID] === id);
/* el lloc del mapa marcat (hover, fletxes) */
function setPlace(id) {
  if (view.place === id) return;
  if (view.place) { const o = plcEl(view.place); if (o) o.classList.remove('on'); }
  view.place = id;
  if (id) { const e = plcEl(id); if (e) e.classList.add('on'); }
  renderPrompts();
}
/* centre de cada nom del mapa, per moure's amb les fletxes */
const placePoints = TOWN.geom.map((p) => {
  const xs = p.icon ? [p.icon[0]] : p.ln.map((l) => l[1] + l[3] / 2), ys = p.icon ? [p.icon[1]] : p.ln.map((l) => l[2]);
  return { id: p.id, x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length };
});
function placeNav(dx, dy) {
  if (!view.place) { setPlace(TOWN.start); return; }
  const cur = placePoints.find((p) => p.id === view.place);
  if (!cur) return;
  const best = nearestInDirection(placePoints, cur, dx, dy, 30);
  if (!best) return;
  setPlace(best.id);
  if (view.card) { if (best.id === 'tauler') closeCard(); else openCard(best.id); }
}
/* el text del lloc que ha escrit el DM, o el de sempre */
function placeText(id) {
  const o = boardData().places[id];
  return typeof o === 'string' ? o : (TOWN.info[id] || {}).text || '';
}
/* caixa del nom (i la fletxa) d'un lloc a l'escenari, per posar-hi la fitxa al costat */
function placeBox(id) {
  const p = PLACES[id], v = mapPose(), ox = MAP.x + v.x, oy = MAP.y + v.y, k = MAP.w * v.s / TOWN.vb[0];
  if (p.icon) return { l: ox + (p.icon[0] - p.icon[2]) * k, r: ox + (p.icon[0] + p.icon[2]) * k, cy: oy + p.icon[1] * k };
  const xs = p.ln.map((l) => l[1]).concat(p.ln.map((l) => l[1] + l[3]), p.ar ? [p.ar[0], p.ar[2]] : []), ys = p.ln.map((l) => l[2] - 25);
  return { l: ox + Math.min(...xs) * k, r: ox + Math.max(...xs) * k, cy: oy + (ys.reduce((a, b) => a + b, 0) / ys.length) * k };
}
function openCard(id) {
  const p = PLACES[id];
  if (!p) return;
  const c = E.pcard, qs = questsAt(id), info = TOWN.info[id] || {};
  const wiki = info.character ? routes.character(info.character) : info.place ? routes.place(info.place) : null;
  if (view.card) { const o = plcEl(view.card); if (o) o.classList.remove('sel'); }
  view.card = id;
  const e = plcEl(id);
  if (e) e.classList.add('sel');
  const quests = qs.length
    ? `<div class="pc-q">${qs.map((q) => `<button type="button" data-q="${esc(q.id)}" style="--c:var(--${CATS[catOf(q)].color})"><i></i><span>${esc(q.title)}${q.hidden ? ' · oculta' : ''}</span></button>`).join('')}</div>`
    : '<div class="pc-none">Res de nou per aquí</div>';
  c.innerHTML = `<div class="pc-k">Lloc</div><div class="pc-t">${esc(p.name)}</div><div class="pc-x"${dmOn ? ' contenteditable="plaintext-only" spellcheck="false"' : ''} data-place="${esc(id)}">${esc(placeText(id))}</div>` +
    quests + (wiki ? `<a class="pc-w" href="${wiki}" target="_blank" rel="noopener">Més a la wiki →</a>` : '');
  c.classList.add('on');
  /* a la dreta del nom o, si no hi cap, a l'esquerra */
  const b = placeBox(id), w = 400, h = c.offsetHeight;
  let x = b.r + 14;
  if (x + w > 1900) x = b.l - 14 - w;
  x = clamp(x, 20, 1900 - w);
  const y = clamp(b.cy - h / 2, 24, STAGE_H - h - 70), rot = (hashOf(id, 7) % 5) - 2;
  gsap.fromTo(c, { left: x, top: y, opacity: 0, y: 12, rotation: rot - 2, scale: 0.96 }, { left: x, top: y, opacity: 1, y: 0, rotation: rot, scale: 1, duration: 0.3 * D, ease: 'power3.out', overwrite: 'auto' });
  renderPrompts();
}
function closeCard() {
  if (!view.card) return;
  const o = plcEl(view.card);
  if (o) o.classList.remove('sel');
  view.card = null;
  E.pcard.classList.remove('on');
  gsap.to(E.pcard, { opacity: 0, y: 10, duration: 0.2 * D, overwrite: 'auto' });
  renderPrompts();
}
function openMap() {
  if (view.zoom === 'map') return Promise.resolve();
  if (view.zoom) return closeDoc().then(() => openMap());
  if (view.focus) lift(view.focus, false);
  view.zoom = 'map';
  view.focus = 'map';
  E.map.classList.add('zoomed');
  E.map.style.zIndex = 107;
  scatter(true, 'map');
  const b = mapBase();
  gsap.to(E.map, { x: b.x, y: b.y, scale: b.s, rotation: 0, duration: 0.7 * D, ease: 'power3.inOut', overwrite: 'auto' });
  liftTo(E.map, 'map', true);
  renderPrompts();
  return wait(700);
}
function closeMap() {
  if (view.zoom !== 'map') return Promise.resolve();
  closeCard();
  setPlace(null);
  view.zoom = null;
  E.map.classList.remove('zoomed');
  gsap.to(E.map, { x: 0, y: 0, scale: FOCUS_SCALE_MAP, rotation: MAP.r, duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { E.map.style.zIndex = ''; lift('map', true); } });
  liftTo(E.map, 'map', false, 0.38);
  scatter(false, 'map');
  renderPrompts();
  return wait(600);
}
/* forat de la llum viva: el rectangle girat de la peça aixecada */
setHoleSource(({ el, kind }) => {
  const x = gp(el, 'x'), y = gp(el, 'y'), r = rad(gp(el, 'rotation')), s = gp(el, 'scaleX') || 1;
  if (kind === 'map') {
    const cx = MAP.w / 2 * s, cy = MAP.h / 2 * s;
    return [MAP.x + x + Math.cos(r) * cx - Math.sin(r) * cy, MAP.y + y + Math.sin(r) * cx + Math.cos(r) * cy, cx, cy, r];
  }
  const W = el._g ? el._g.W : 0, H = el._g ? el._g.H : 0;
  return [x + W / 2, y + H / 2, W / 2 * s, H / 2 * s, r];
});

/* mapa en píxel (pixel.js): abans de l'onada, el mapa ha de quedar ampliat, sense fitxes i a la mida inicial */
function startPixel() {
  toPixel(async () => {
    setArrange(false);
    if (view.zoom !== 'map') await openMap();
    closeCard();
    setPlace(null);
    const v = viewOf(), o = v && poseOf(v.el);
    if (o && Math.abs(o.s - v.base.s) > 1e-3) { setPose(v, Object.assign({}, v.base), 0.35); await wait(380); }
  });
}

/* =================================================================== zoom i desplaçament */
/* Sobre el paper o el mapa ampliats, la roda del ratolí acosta cap al punt on és el ratolí i el botó del mig
   arrossega. Tornar a la mida inicial amb la roda el recol·loca on era. */
const mapBase = () => ({ x: (STAGE_W - MAP.w * MAP_ZOOM) / 2 - MAP.x, y: (STAGE_H - MAP.h * MAP_ZOOM) / 2 - MAP.y, s: MAP_ZOOM });
/* la peça ampliada: posició base, origen de la transformació respecte de x/y (el mapa escala des del cantó,
   els papers des del centre; f és la fracció de mida que l'origen té a l'esquerra), zoom màxim i punt d'ancoratge */
function viewOf() {
  if (gateOpen()) return null;
  if (view.zoom === 'map') return { el: E.map, base: mapBase(), or: [MAP.x, MAP.y], f: 0, w: MAP.w, h: MAP.h, max: MAP_ZOOM * VIEW_ZOOM_MAX, anchor: [STAGE_W / 2, STAGE_H / 2] };
  if (!view.zoom || !view.zEl || !view.zEl._g) return null;
  const g = view.zEl._g, z = zoomTarget(g);
  return { el: view.zEl, base: { x: z.x, y: z.y, s: z.scale }, or: [g.W / 2, g.H / 2], f: 0.5, w: g.W, h: g.H, max: z.scale * VIEW_ZOOM_MAX, anchor: [z.x + g.W / 2, z.y + g.H / 2] };
}
/* posició actual (o la de destí si ja hi anem); null mentre el paper o el mapa encara vola */
function poseOf(el) {
  if (el._vt) return el._v;
  if (gsap.isTweening(el)) return null;
  return { x: gp(el, 'x'), y: gp(el, 'y'), s: gp(el, 'scaleX') || 1 };
}
function mapPose() { return (view.zoom === 'map' && poseOf(E.map)) || mapBase(); }
/* el centre on s'havia obert ha de quedar sempre a sobre del paper o del mapa */
function clampPose(v, o) {
  const l = o.x + v.or[0] - v.f * v.w * o.s, t = o.y + v.or[1] - v.f * v.h * o.s, r = l + v.w * o.s, b = t + v.h * o.s;
  if (l > v.anchor[0]) o.x -= l - v.anchor[0]; else if (r < v.anchor[0]) o.x += v.anchor[0] - r;
  if (t > v.anchor[1]) o.y -= t - v.anchor[1]; else if (b < v.anchor[1]) o.y += v.anchor[1] - b;
  return o;
}
function setPose(v, o, dur) {
  const el = v.el;
  if (o.s <= v.base.s * 1.02) { o = Object.assign({}, v.base); dur = Math.max(dur, 0.3); }
  else o = clampPose(v, o);
  el._v = o;
  el._vt = true;
  if (view.card) closeCard();
  const end = () => { el._vt = false; };
  gsap.killTweensOf(el, 'x,y,scale');
  if (dur) gsap.to(el, { x: o.x, y: o.y, scale: o.s, duration: dur * D, ease: 'power2.out', onComplete: end, onInterrupt: end });
  else { gsap.set(el, { x: o.x, y: o.y, scale: o.s }); end(); }
}
const PANELS = '#dmcard, #dmbar, #chrome, #hist';
function onWheel(e) {
  if (pixelOn()) return;
  if (arrange.on) { arrWheel(e); return; }
  const v = viewOf();
  if (!v || closestIn(e.target, PANELS + ', #pcard')) return;
  e.preventDefault();
  const o = poseOf(v.el);
  if (!o) return;
  const ns = clamp(o.s * Math.exp(-wheelPixels(e) * 0.0016), v.base.s, v.max), f = ns / o.s;
  if (Math.abs(f - 1) < 1e-4) return;
  /* el punt sota el ratolí es queda quiet: l'origen de la transformació s'hi apropa o se n'allunya en proporció */
  const p = toStage(e), ox = o.x + v.or[0], oy = o.y + v.or[1];
  setPose(v, { x: p.x + (ox - p.x) * f - v.or[0], y: p.y + (oy - p.y) * f - v.or[1], s: ns }, 0.16);
}
let pan = null;
function onPanStart(e) {
  if (e.button !== 1 || pixelOn()) return;
  const v = viewOf();
  if (!v || closestIn(e.target, PANELS)) return;
  e.preventDefault();
  const o = poseOf(v.el);
  if (!o) return;
  pan = { v, o: Object.assign({}, o), p: toStage(e) };
  document.body.classList.add('panning');
  if (view.card) closeCard();
}
function onPanMove(e) {
  if (!pan) return;
  const p = toStage(e);
  setPose(pan.v, { x: pan.o.x + p.x - pan.p.x, y: pan.o.y + p.y - pan.p.y, s: pan.o.s }, 0);
}
function onPanEnd() {
  if (!pan) return;
  pan = null;
  document.body.classList.remove('panning');
}

/* =================================================================== col·locar papers (mode DM) */
/* «Moure papers»: el DM arrossega qualsevol paper, el mapa o la pila i els gira amb la nansa ↻ o la roda.
   La posició es desa al layout del tauler (va amb la resta de dades en publicar) i el paper ja no ocupa cap lloc
   automàtic; amb doble clic hi torna. */
const arrange = { on: false, hover: null, drag: null, wheel: null, wheelT: null };
let fixedSig = '';
/* mapa i pila: posició del DM o la de sempre; si canvia, hi llisquen des d'on eren */
function applyFixed(anim) {
  const lm = boardData().layout.map || {}, lp = boardData().layout.pile || {}, sig = JSON.stringify([lm, lp]);
  if (sig === fixedSig) return;
  const first = !fixedSig;
  fixedSig = sig;
  const om = { x: MAP.x, y: MAP.y }, op = { x: PILE.x, y: PILE.y };
  MAP.x = num(lm.x, MAP_HOME.x); MAP.y = num(lm.y, MAP_HOME.y); MAP.r = num(lm.r, MAP_HOME.r);
  PILE.x = num(lp.x, PILE_HOME.x); PILE.y = num(lp.y, PILE_HOME.y); PILE.r = num(lp.r, PILE_HOME.r);
  Object.assign(E.map.style, { left: MAP.x + 'px', top: MAP.y + 'px' });
  Object.assign(E.pile.style, { left: PILE.x + 'px', top: PILE.y + 'px', width: PILE.w + 'px', height: PILE.h + 'px' });
  if (first) return;
  const d = anim ? 0.45 * D : 0;
  if (view.zoom !== 'map') {
    gsap.set(E.map, { x: gp(E.map, 'x') + om.x - MAP.x, y: gp(E.map, 'y') + om.y - MAP.y, overwrite: true });
    gsap.to(E.map, { x: 0, y: 0, rotation: MAP.r, scale: 1, duration: d, ease: 'power3.out', overwrite: 'auto' });
  }
  gsap.set(E.pile, { x: gp(E.pile, 'x') + op.x - PILE.x, y: gp(E.pile, 'y') + op.y - PILE.y, overwrite: true });
  gsap.to(E.pile, { x: 0, y: 0, rotation: PILE.r, scale: 1, duration: d, ease: 'power3.out', overwrite: 'auto' });
}
/* el mapa gira des del cantó de dalt a l'esquerra: conversions entre aquest cantó i el centre */
function mapCenter(x, y, r) {
  const a = rad(r), hw = MAP.w / 2, hh = MAP.h / 2;
  return { cx: x + Math.cos(a) * hw - Math.sin(a) * hh, cy: y + Math.sin(a) * hw + Math.cos(a) * hh };
}
function mapCorner(cx, cy, r) {
  const a = rad(r), hw = MAP.w / 2, hh = MAP.h / 2;
  return { x: cx - Math.cos(a) * hw + Math.sin(a) * hh, y: cy - Math.sin(a) * hw - Math.cos(a) * hh };
}
/* centre, gir i mida (al tauler) de cada peça */
function arrGet(key) {
  if (key === 'map') return Object.assign({ key, el: E.map, r: MAP.r, w: MAP.w, h: MAP.h }, mapCenter(MAP.x, MAP.y, MAP.r));
  if (key === 'pile') return { key, el: E.pile, cx: PILE.x + PILE.w / 2, cy: PILE.y + PILE.h / 2, r: PILE.r, w: PILE.w, h: PILE.h };
  const el = docs.get(key), g = board && board.slots[key];
  return el && g ? { key, el, cx: g.cx, cy: g.cy, r: g.r, w: g.w, h: g.h, g } : null;
}
function arrKeyAt(t) {
  if (!t || !t.closest) return null;
  const d = t.closest('.doc');
  if (d) return board.slots[d.dataset.id] ? d.dataset.id : null;
  if (t.closest('#pile')) return board.done.length ? 'pile' : null;
  return t.closest('#bmap') ? 'map' : null;
}
/* pose en directe mentre s'arrossega o es gira (up: la peça aixecada, amb ombra) */
function arrPose(it, cx, cy, r, up, dur) {
  let o;
  if (it.key === 'map') { const c = mapCorner(cx, cy, r); o = { x: c.x - MAP.x, y: c.y - MAP.y, scale: 1, rotation: r }; }
  else if (it.key === 'pile') o = { x: cx - it.cx, y: cy - it.cy, scale: up ? 1.03 : 1, rotation: r };
  else o = { x: cx - it.g.W / 2, y: cy - it.g.H / 2, scale: it.g.s * (up ? 1.03 : 1), rotation: r };
  gsap.to(it.el, Object.assign({ duration: dur * D, ease: 'power3.out', overwrite: 'auto' }, o));
  it.el.classList.toggle('arr-up', !!up);
}
/* prev: com era el layout abans d'agafar la peça (si en agafar-la s'han renumerat les altres, també s'envien) */
function arrCommit(it, cx, cy, r, z, prev = clone(boardData().layout)) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(((r + 540) % 360 - 180) * 10) / 10;
  const layout = boardData().layout;
  if (it.key === 'map') { const c = mapCorner(cx, cy, r); layout.map = { x: Math.round(c.x), y: Math.round(c.y), r }; }
  else if (it.key === 'pile') layout.pile = { x: cx - PILE.w / 2, y: cy - PILE.h / 2, r };
  else layout[it.key] = { cx, cy, r, w: it.g.w, h: it.g.h, z: z || it.g.z };
  it.el.classList.remove('arr-up');
  saveLayout(prev);
  renderBoard(true);
}
function arrReset(key) {
  if (!boardData().layout[key]) return;
  const prev = clone(boardData().layout);
  delete boardData().layout[key];
  saveLayout(prev);
  renderBoard(true);
  setTimeout(() => arrHover(key), 500 * D);
}
/* el paper que s'agafa passa a sobre de tots; si la pila creix massa, es comprimeix */
function topZ() {
  let z = Math.max(40, ...board.ids.map((id) => board.slots[id].z)) + 1;
  if (z > 88) {
    Object.values(boardData().layout).forEach((P) => { if (P && P.z) P.z = Math.max(20, P.z - 40); });
    z = 50;
  }
  return z;
}
/* nansa de girar: cantonada de dalt a la dreta, o la de baix si quedaria sota la barra del DM */
function placeHandle(it, cx, cy, r) {
  const a = rad(r), vx = it.w / 2 + 4, at = (vy) => [cx + Math.cos(a) * vx - Math.sin(a) * vy, cy + Math.sin(a) * vx + Math.cos(a) * vy];
  let [x, y] = at(-it.h / 2 - 4);
  if (y < 100) [x, y] = at(it.h / 2 + 4);
  gsap.set(E.rhandle, { x: clamp(x - 23, 4, 1870), y: clamp(y - 23, 4, 1030) });
  E.rhandle.classList.add('on');
}
function arrHover(key) {
  if (arrange.drag) return;
  const it = key && arrGet(key);
  arrange.hover = it ? key : null;
  if (it) placeHandle(it, it.cx, it.cy, it.r); else E.rhandle.classList.remove('on');
}
function setArrange(on) {
  if (on && !dmOn) return;
  if (on && view.zoom) { closeAny().then(() => setArrange(true)); return; }
  if (arrange.on === on) return;
  arrange.on = on;
  arrange.drag = null;
  if (on && view.focus) { lift(view.focus, false); view.focus = null; }
  stage.classList.toggle('arrange', on);
  if (!on) { E.rhandle.classList.remove('on'); arrange.hover = null; document.body.classList.remove('arr-drag'); }
  gsap.to(E.zp, { opacity: on ? 1 : 0, duration: 0.3 * D });
  renderDmBar();
  renderPrompts();
}
function arrDown(e) {
  if (!arrange.on || e.button !== 0 || gateOpen()) return;
  const onHandle = !!closestIn(e.target, '#rhandle');
  const key = onHandle ? arrange.hover : arrKeyAt(e.target), it = key && arrGet(key);
  if (!it) return;
  e.preventDefault();
  const p = toStage(e), prev = clone(boardData().layout);
  arrange.drag = { it, rot: onHandle, p0: p, cx: it.cx, cy: it.cy, r: it.r, a0: Math.atan2(p.y - it.cy, p.x - it.cx), z: it.g ? topZ() : 0, moved: false, prev };
  it.el.style.zIndex = it.key === 'map' ? 60 : 95;
  document.body.classList.add('arr-drag');
  arrPose(it, it.cx, it.cy, it.r, true, 0.2);
}
function arrMove(e) {
  const d = arrange.drag;
  if (!d) return;
  const p = toStage(e), it = d.it;
  if (d.rot) {
    const r = it.r + (Math.atan2(p.y - it.cy, p.x - it.cx) - d.a0) * 180 / Math.PI;
    d.r = e.shiftKey ? Math.round(r / 15) * 15 : r;
  } else {
    d.cx = clamp(it.cx + p.x - d.p0.x, 20, STAGE_W - 20);
    d.cy = clamp(it.cy + p.y - d.p0.y, 20, STAGE_H - 20);
  }
  d.moved = d.moved || Math.abs(p.x - d.p0.x) + Math.abs(p.y - d.p0.y) > 3;
  arrPose(it, d.cx, d.cy, d.r, true, 0.14);
  placeHandle(it, d.cx, d.cy, d.r);
}
function arrUp() {
  const d = arrange.drag;
  if (!d) return;
  arrange.drag = null;
  document.body.classList.remove('arr-drag');
  const it = d.it;
  if (isPiece(it.key)) it.el.style.zIndex = '';
  if (d.moved) arrCommit(it, d.cx, d.cy, d.r, d.z, d.prev);
  else {
    arrPose(it, it.cx, it.cy, it.r, false, 0.25);
    if (it.g) it.el.style.zIndex = it.g.z;
    saveLayout(d.prev);
  }
  arrHover(it.key);
}
/* la roda gira la peça que hi ha sota el ratolí; es desa quan s'atura */
function arrWheel(e) {
  const key = arrKeyAt(e.target) || (closestIn(e.target, '#rhandle') ? arrange.hover : null);
  if (!key || arrange.drag) return;
  e.preventDefault();
  const it = arrGet(key);
  if (!it) return;
  const base = arrange.wheel && arrange.wheel.key === key ? arrange.wheel.r : it.r;
  const r = base + clamp(wheelPixels(e) * 0.03, -6, 6);
  arrange.wheel = { key, r };
  arrPose(it, it.cx, it.cy, r, false, 0.16);
  placeHandle(it, it.cx, it.cy, r);
  clearTimeout(arrange.wheelT);
  arrange.wheelT = setTimeout(() => {
    const w = arrange.wheel, cur = w && arrGet(w.key);
    arrange.wheel = null;
    if (cur) arrCommit(cur, cur.cx, cur.cy, w.r);
  }, 350);
}

/* =================================================================== indicacions */
function renderPrompts() {
  const pad = inputKind === 'pad', k = (t, round) => `<i class="key${round ? ' round' : ''}">${t}</i>`;
  const arrows = pad ? k('◀') + k('▶') : k('←') + k('→'), ok = pad ? k('A', 1) : k('↵'), back = pad ? k('B', 1) : k('Esc');
  let z = [];
  if (arrange.on) {
    z = ['<span>Arrossega per moure</span>', `<span>${k('↻', 1)}o roda per girar · ${k('Maj')}de 15° en 15°</span>`, '<span>Doble clic: al seu lloc automàtic</span>', `<span>${k('Esc')}Fet</span>`];
  } else if (view.zoom === 'map') {
    z = [`<span>${arrows}Llocs</span>`];
    if (!(view.card && !questsAt(view.card).length)) z.push(`<span>${ok}${view.card ? 'Obrir la missió' : 'Veure el lloc'}</span>`);
    z.push(`<span>${back}${view.card ? 'Tancar' : 'Tornar al tauler'}</span>`);
  } else if (view.zoom) {
    z = [`<span>${arrows}Un altre paper</span>`, `<span>${back}Tornar al tauler</span>`, `<span>${pad ? k('Y', 1) : k('M')}Mapa</span>`];
  }
  if (view.zoom && !arrange.on && inputKind === 'mouse') z.push(`<span>${k('Roda')}Zoom · ${k('Botó del mig')}Moure</span>`);
  E.zp.innerHTML = z.join('');
  /* amb la fitxa del DM oberta, les indicacions van centrades sota el paper */
  E.zp.style.left = !arrange.on && view.zoom && view.zoom !== 'map' && dmOn ? '-540px' : '0';
}

/* =================================================================== mode DM */
const STATUS_TEXT = { saved: 'Tot desat', saving: 'Desant…', offline: 'Sense connexió · es tornarà a provar' };
function updateStat() {
  if (!dmOn || !E.dmbar.firstChild) return;
  const st = remote.currentStatus(), s = $('.stat', E.dmbar);
  if (!s) return;
  s.textContent = STATUS_TEXT[st];
  s.title = STATUS_TEXT[st];
  s.classList.toggle('dirty', st !== 'saved');
}
/* el servidor ha rebutjat un canvi: es diu i el tauler torna a ser el del servidor */
function writeRejected(e) {
  if (e instanceof api.ApiError && e.status === 403) {
    toast('Ja no tens el permís de DM (fa massa que no el fas servir): torna-hi a entrar.', 5200);
    role = 'player';
    setDm(false);
    return;
  }
  toast('No s’ha pogut desar: ' + e.message, 5200);
  reloadBoard();
}
function authLost() {
  toast('La sessió s’ha tancat. Torna a entrar amb la contrasenya del grup.', 4200);
  api.forgetSession();
  setTimeout(() => location.reload(), 1600);
}

async function unlockDm() {
  if (role === 'dm') return true;
  const ok = await askGate({
    kicker: 'Mode DM', title: 'Només per al DM', text: 'Escriu la contrasenya del DM per veure les missions ocultes i editar el tauler.', ph: 'Contrasenya del DM', btn: 'Entrar', cancel: 'Cancel·lar',
    check: async (pw) => {
      try {
        role = (await api.login('dm', pw)).role;
        return null;
      } catch (e) {
        return loginError(e);
      }
    }
  });
  if (!ok) return false;
  /* el tauler del DM té les missions ocultes, les notes i els ecos per recuperar */
  await reloadBoard();
  return role === 'dm';
}
async function setDm(on) {
  if (on && readOnly) { toast('Sense connexió amb el servidor: el mode DM no hi és fins que torni.'); return; }
  if (on && !(await unlockDm())) return;
  if (dmOn === on) return;
  if (!on) { setArrange(false); closeHistory(); }
  /* una missió oculta no es pot quedar oberta davant dels jugadors */
  if (!on && view.zoom && view.zoom !== 'map') { const q = qById(view.zoom); if (q && q.hidden) await closeDoc(); }
  dmOn = on;
  stage.classList.toggle('dm', on);
  E.dmBtn.textContent = on ? 'Sortir del mode DM' : 'Mode DM';
  E.dmbar.hidden = !on;
  E.chrome.classList.toggle('show', !on);
  if (on) { renderDmBar(); gsap.fromTo(E.dmbar, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.35 * D }); }
  renderBoard(true);
  if (view.zoom && view.zoom !== 'map' && view.zEl) {
    if (on) enterEdit(view.zEl); else { setEditing(view.zEl, false); hideDmCard(); }
    flyToZoom(view.zEl, 0.5);
  }
  if (view.card) openCard(view.card);
  renderPrompts();
  if (!on) {
    /* la sessió deixa de ser de DM (en aquesta pantalla cal la contrasenya per tornar-hi) i el tauler, de tenir-ne res */
    await remote.whenIdle();
    try { await api.leaveDm(); role = 'player'; } catch (e) { /* sense connexió: ja caducarà */ }
    await reloadBoard();
  }
}
function renderDmBar() {
  if (!dmOn) return;
  E.dmbar.innerHTML = `<span class="k">Mode DM</span><span class="sep"></span>
    <button class="btn" type="button" data-dm="new">+ Nova missió</button>
    <button class="btn${arrange.on ? ' on' : ''}" type="button" data-dm="arrange">${arrange.on ? 'Fet' : 'Moure papers'}</button>
    ${TOWN.pixel ? '<button class="btn" type="button" data-dm="pixel" title="Transforma el mapa en el de l\'RPG Map Viewer (tecla P)">Mapa en píxel</button><button class="btn" type="button" data-dm="viewer" title="Adreça de l\'RPG Map Viewer">Visor</button>' : ''}
    <span class="sep"></span><span class="stat"></span>
    <button class="btn${E.hist.classList.contains('on') ? ' on' : ''}" type="button" data-dm="history">Historial</button>
    <button class="btn" type="button" data-dm="export">Exportar</button><button class="btn" type="button" data-dm="import">Importar</button>
    <button class="btn" type="button" data-dm="exit">Sortir</button>`;
  updateStat();
}

/* fitxa del DM al costat del paper ampliat */
function enterEdit(el) {
  setEditing(el, true);
  renderDmCard();
}
function setEditing(el, on) {
  if (!el || el.classList.contains('editing') === on) return;
  el.classList.toggle('editing', on);
  const q = qById(el.dataset.id);
  if (q) applyDoc(el, q, el._g, true);
  if (!on) setEditable(el, false);
}
function setEditable(el, on) {
  $$('[data-f]', el).forEach((f) => {
    if (!on) { f.removeAttribute('contenteditable'); return; }
    /* plaintext-only on es pot (no enganxa formats); si el navegador no el coneix, true */
    f.setAttribute('contenteditable', 'plaintext-only');
    if (f.contentEditable !== 'plaintext-only') f.setAttribute('contenteditable', 'true');
    f.spellcheck = false;
  });
}
function hideDmCard() {
  E.dmcard.classList.remove('on');
  gsap.to(E.dmcard, { opacity: 0, x: 40, duration: 0.25 * D, overwrite: 'auto' });
}
function renderDmCard() {
  const q = view.zEl && qById(view.zEl.dataset.id), c = E.dmcard;
  if (!dmOn || !q) { hideDmCard(); return; }
  const cat = catOf(q), tracked = state.tracked === q.id;
  const placeOpts = TOWN.geom.filter((p) => p.id !== 'tauler').map((p) => `<option value="${p.id}"${q.towns[TOWN_ID] === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const tags = [isDone(q) ? 'Completada' : 'En curs', q.hidden ? 'Oculta als jugadors' : 'Visible', tracked && 'Seguida']
    .concat(Object.keys(q.towns).filter((t) => t !== TOWN_ID).map((t) => 'També a ' + (TOWNS[t] ? TOWNS[t].name : t)))
    .filter(Boolean);
  const acts = [
    isDone(q) ? '<button class="btn" type="button" data-q="reopen">Reobrir</button>' : '<button class="btn pri" type="button" data-q="complete">Completar</button>',
    q.hidden ? '<button class="btn pri" type="button" data-q="reveal">Revelar</button>' : '<button class="btn" type="button" data-q="hide">Amagar</button>'
  ];
  if (!isDone(q) && !q.hidden) acts.push(`<button class="btn${tracked ? ' on' : ''}" type="button" data-q="track">${tracked ? 'Seguida' : 'Seguir'}</button>`);
  /* si el DM ja era dins d'un camp de la fitxa (p. ex. hi ha clicat des del paper), s'hi queda */
  const active = document.activeElement, keep = c.contains(active) && active.dataset.k ? active : null;
  const sel = keep && 'selectionStart' in keep ? [keep.selectionStart, keep.selectionEnd] : null;
  const seg = (keys, attr, isOn, label) => `<div class="seg">${keys.map((k) => `<button class="btn${isOn(k) ? ' on' : ''}" type="button" data-${attr}="${k}">${esc(label(k))}</button>`).join('')}</div>`;
  const field = (label, k, extra = '') => `<label class="fl"><span>${label}</span><input data-k="${k}" value="${esc(q[k] || '')}"${extra}></label>`;
  c.innerHTML = `<div class="dmc-k">Fitxa del DM</div>
    <div class="dmc-st">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    <div class="dmc-acts">${acts.join('')}</div>
    <div class="fl"><span>Tipus</span>${seg(Object.keys(CATS), 'cat', (k) => cat === k, (k) => CATS[k].short)}</div>
    <div class="fl"><span>Taulers <small>(la mateixa missió a tots)</small></span>${seg(Object.keys(TOWNS), 'town', (k) => k in q.towns, (k) => TOWNS[k].name)}</div>
    <div class="two">
      ${field(`Per a ${cat === 'personal' ? '' : '<small>(personals)</small>'}`, 'who', cat === 'personal' ? '' : ' disabled')}
      ${field('Encàrrec de', 'giver')}
    </div>
    <div class="two">
      ${field('Lloc (text)', 'where')}
      <label class="fl"><span>Al mapa de ${esc(TOWN.name)}</span><select data-k="place"><option value="">Cap lloc</option>${placeOpts}</select></label>
    </div>
    ${field(`Recompensa ${cat === 'secundaria' ? '' : '<small>(cartells secundaris)</small>'}`, 'reward')}
    <label class="fl"><span>Nota del DM (no la veu ningú més)</span><textarea data-k="note" rows="3">${esc(q.note || '')}</textarea></label>
    <p class="dmc-help">El títol, el text i els objectius s'escriuen directament sobre el paper. ${q.special === 'ecos' ? 'Clica un eco per recuperar-lo o bloquejar-lo.' : ''}</p>
    <div class="dmc-acts dmc-end"><button class="btn warn" type="button" data-q="delete">Eliminar la missió</button></div>`;
  const again = keep && $(`[data-k="${keep.dataset.k}"]`, c);
  if (again) {
    again.focus();
    if (sel && again.setSelectionRange) again.setSelectionRange(sel[0], sel[1]);
  }
  if (!c.classList.contains('on')) {
    c.classList.add('on');
    gsap.fromTo(c, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 * D, delay: 0.25 * D, ease: 'power3.out', overwrite: 'auto' });
  }
}
/* ---------- desar a l'API ---------- */
/* Cada canvi ja s'ha fet al tauler; aquí s'envia. Les missions porten la versió que té el tauler: si una altra pantalla
   l'ha canviada mentrestant, el servidor diu que no (409) i el tauler es queda amb la del servidor. */
const qKey = (id) => 'quest:' + id;
/* la resposta del servidor: la versió nova i, si ja no queda res per enviar d'aquesta missió, la missió sencera */
function questSaved(res) {
  const q = res && res.quest, cur = q && qById(q.id);
  if (!cur) return;
  if (remote.busy(qKey(q.id))) { cur.version = Math.max(cur.version, q.version); return; }
  Object.assign(cur, q);
}
function questConflict(e) {
  const fresh = e instanceof api.ApiError && e.code === 'version_mismatch' && e.details && e.details.quest;
  if (!fresh) { writeRejected(e); return; }
  const cur = qById(fresh.id);
  if (cur) Object.assign(cur, fresh);
  toast(`Una altra pantalla havia canviat «${fresh.title || 'aquesta missió'}»: ara la tens com ha quedat.`, 5200);
  afterStateChange();
}
const questWrite = (id, run) => remote.write([qKey(id)], run, { onDone: questSaved, onError: questConflict });
const patchQuest = (id, fields) => questWrite(id, () => api.request('PATCH', `/v1/quests/${encodeURIComponent(id)}`, { body: fields, ifMatch: qById(id) ? qById(id).version : undefined }));
const stepPath = (id, stepId) => `/v1/quests/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`;
function saveLayout(prev) {
  const now = boardData().layout, pieces = {};
  for (const k of new Set([...Object.keys(prev), ...Object.keys(now)])) {
    if (JSON.stringify(prev[k] || null) !== JSON.stringify(now[k] || null)) pieces[k] = now[k] || null;
  }
  const keys = Object.keys(pieces);
  if (keys.length) remote.write(keys.map((k) => 'layout:' + k), () => api.request('PATCH', `/v1/boards/${TOWN_ID}/layout`, { body: { pieces } }));
}
const savePlace = (place, text) =>
  remote.write(['place:' + place], () => api.request('PUT', `/v1/boards/${TOWN_ID}/places/${encodeURIComponent(place)}`, { body: { text } }));

/* ---------- accions sobre la missió ampliada ---------- */
/* eliminar demana un segon clic en pocs segons */
let armedDel = null, armedDelT = null;
function questAction(act) {
  const el = view.zEl, q = el && qById(el.dataset.id);
  if (!q) return;
  const untrack = () => { if (state.tracked === q.id) state.tracked = null; };
  if (act === 'delete') {
    if (armedDel !== q.id) {
      armedDel = q.id;
      clearTimeout(armedDelT);
      armedDelT = setTimeout(() => { armedDel = null; }, 5000);
      toast('Torna a clicar «Eliminar la missió» per esborrar-la del tot.');
      return;
    }
    armedDel = null;
    state.quests = state.quests.filter((x) => x !== q);
    untrack();
    for (const k of Object.keys(boardData().layout)) if (k === q.id) delete boardData().layout[k];
    remote.write([qKey(q.id), 'tracked', 'layout:' + q.id], () => api.request('DELETE', `/v1/quests/${encodeURIComponent(q.id)}`));
    closeDoc().then(() => renderBoard(true));
    return;
  }
  if (act === 'complete') {
    q.status = 'done';
    q.doneAt = Date.now();
    untrack();
  } else if (act === 'reopen') {
    q.status = 'active';
    q.doneAt = null;
  } else if (act === 'reveal') q.hidden = false;
  else if (act === 'hide') {
    q.hidden = true;
    untrack();
  } else if (act === 'track') state.tracked = state.tracked === q.id ? null : q.id;
  if (act === 'track') remote.write(['tracked'], () => api.request('PUT', '/v1/tracked', { body: { questId: state.tracked } }));
  else remote.write([qKey(q.id), 'tracked'], () => api.request('POST', `/v1/quests/${encodeURIComponent(q.id)}/${act}`), { onDone: questSaved, onError: questConflict });
  renderBoard(true);
  if (act === 'complete' || act === 'reopen') applyDoc(el, q, el._g, true);
  if (act === 'complete') {
    gsap.fromTo($('.d-stamp', el), { opacity: 0, scale: 2.2, rotation: -24 }, { opacity: 0.88, scale: 1, rotation: -11, duration: 0.32 * D, ease: 'back.out(2)', clearProps: 'opacity' });
    gsap.fromTo(E.shell, { x: -10 }, { x: 0, duration: 0.6 * D, ease: 'elastic.out(1,0.3)', delay: 0.24 * D });
  }
  if (el._g && board.slots[q.id] && !el._temp) applyDoc(el, q, board.slots[q.id]);
  if (view.zEl === el) flyToZoom(el, 0.4, 'power2.inOut');
  renderDmCard();
}
function newQuest() {
  const id = newId('q');
  const q = {
    id, version: 0, position: Math.max(-1, ...state.quests.map((x) => x.position)) + 1, cat: 'secundaria', title: 'Nova missió', text: '', reward: '',
    who: '', giver: '', where: '', special: null, status: 'active', doneAt: null, hidden: true, note: '', towns: { [TOWN_ID]: null }, steps: []
  };
  state.quests.push(q);
  questWrite(id, () => api.request('POST', '/v1/quests', { body: { id, cat: q.cat, title: q.title, hidden: true, towns: q.towns } }));
  renderBoard(true);
  setTimeout(() => openDoc(id).then(() => {
    const t = view.zEl && $('.d-t', view.zEl);
    if (t) placeCaret(t, true);
  }), 120);
}
/* Una còpia sencera (amb `boards`) ho substitueix tot; un fitxer d'un sol tauler (com les missions d'un poble nou)
   s'hi afegeix: les que ja existeixen (mateix id o títol) s'enllacen amb aquest tauler. Ho fa el servidor. */
function importFile(file) {
  file.text().then(async (txt) => {
    const d = JSON.parse(txt);
    if (!d || !Array.isArray(d.quests)) throw new Error('format');
    if (d.board && d.board !== TOWN_ID) { toast(`Aquest fitxer és del tauler de ${TOWNS[d.board] ? TOWNS[d.board].name : d.board}: importa'l allà.`, 4200); return; }
    const whole = !!d.boards || (!d.board && TOWN_ID === 'phentanil');
    if (view.zoom) await closeAny();
    await remote.whenIdle();
    try {
      const r = await api.request('POST', whole ? '/v1/import?mode=replace' : `/v1/import?mode=merge&town=${TOWN_ID}`, { body: d });
      toast(whole ? `Importades ${r.quests} missions. Hi ha una còpia de l’estat d’abans a l’historial.` : `${r.added} missions noves i ${r.linked} enllaçades amb les que ja hi havia.`, 5200);
      await reloadBoard();
    } catch (e) {
      toast('No s’ha pogut importar: ' + e.message, 5200);
    }
  }).catch(() => toast('Aquest fitxer no és un tauler de missions vàlid.'));
}
async function exportFile() {
  try {
    const data = await api.request('GET', '/v1/export');
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'missions-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    toast('No s’ha pogut exportar: ' + e.message, 4200);
  }
}

/* ---------- edició sobre el paper ---------- */
let editT = null;
const cardT = {};
const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ').trim();
/* el que s'ha escrit en un camp del paper passa a la missió i s'envia (si ha canviat) */
function readField(el, f) {
  const q = qById(el.dataset.id);
  if (!q) return;
  const kind = f.dataset.f, val = plainText(f);
  if (kind === 'step') {
    const s = q.steps.find((x) => x.id === f.closest('li').dataset.step), t = oneLine(val);
    if (s && s.text !== t) {
      s.text = t;
      questWrite(q.id, () => api.request('PATCH', stepPath(q.id, s.id), { body: { text: t } }));
    }
  } else {
    const v = kind === 'text' ? val.replace(/\n{3,}/g, '\n\n').trim() : oneLine(val);
    if (q[kind] !== v) {
      q[kind] = v;
      patchQuest(q.id, { [kind]: v });
    }
  }
  remote.setEditing(qKey(q.id), false);
  /* el paper ja mostra el que s'ha escrit: no cal tornar-lo a pintar (perdria el cursor) */
  el._sig = docSig(q, el._g, texFor(q, el._g), true);
}
function refreshEditing(el, focusSel) {
  const q = qById(el.dataset.id);
  if (!q) return;
  applyDoc(el, q, el._g, true);
  const f = focusSel && $(focusSel, el);
  if (f) placeCaret(f, false);
}
function editingDoc(e) {
  const f = closestIn(e.target, '[data-f]'), el = closestIn(e.target, '.doc');
  return f && el && el.classList.contains('editing') ? { f, el } : null;
}
function onDocInput(e) {
  const ed = editingDoc(e);
  if (!ed) return;
  remote.setEditing(qKey(ed.el.dataset.id), true);
  clearTimeout(editT);
  editT = setTimeout(() => readField(ed.el, ed.f), 400);
}
function addStepAt(el, q, index) {
  const step = { id: newId('s'), text: '', done: false };
  const after = index > 0 ? q.steps[index - 1].id : null;
  q.steps.splice(index, 0, step);
  questWrite(q.id, () => api.request('POST', `/v1/quests/${encodeURIComponent(q.id)}/steps`, { body: { id: step.id, text: '', after } }));
  refreshEditing(el, `li[data-step="${step.id}"] .tx`);
}
function removeStep(el, q, stepId, focusSel) {
  q.steps = q.steps.filter((s) => s.id !== stepId);
  questWrite(q.id, () => api.request('DELETE', stepPath(q.id, stepId)));
  refreshEditing(el, focusSel);
}
function onDocKey(e) {
  const ed = editingDoc(e);
  if (!ed) return;
  const { f, el } = ed, q = qById(el.dataset.id);
  if (!q) return;
  const kind = f.dataset.f;
  if (e.key === 'Escape' || (e.key === 'Enter' && (kind === 'title' || kind === 'reward'))) { e.preventDefault(); f.blur(); return; }
  if (kind !== 'step') return;
  /* als objectius, Retorn n'afegeix un a sota i esborrar-ne un de buit el treu */
  const i = +f.closest('li').dataset.i;
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(editT);
    readField(el, f);
    addStepAt(el, q, i + 1);
  } else if (e.key === 'Backspace' && !f.innerText.trim()) {
    e.preventDefault();
    clearTimeout(editT);
    removeStep(el, q, q.steps[i].id, i > 0 ? `li[data-i="${i - 1}"] .tx` : null);
  }
}
function onDocBlur(e) {
  const ed = editingDoc(e);
  if (!ed) return;
  clearTimeout(editT);
  readField(ed.el, ed.f);
  /* si el focus passa a un altre camp del mateix paper, només cal reajustar la mida del text */
  setTimeout(() => {
    const a = document.activeElement;
    if (ed.el.contains(a) && a.closest('[data-f]')) { fitDoc(ed.el); return; }
    refreshEditing(ed.el);
    renderDmCard();
  }, 0);
}
function onDocClick(e) {
  const el = closestIn(e.target, '.doc');
  if (!el || !el.classList.contains('editing')) return;
  const q = qById(el.dataset.id);
  if (!q) return;
  const act = closestIn(e.target, '[data-act]'), box = closestIn(e.target, '.bx'), eco = closestIn(e.target, '[data-eco]');
  if (act && act.dataset.act === 'addstep') addStepAt(el, q, q.steps.length);
  else if (act && act.dataset.act === 'delstep') removeStep(el, q, act.closest('li').dataset.step);
  else if (box) {
    const s = q.steps.find((x) => x.id === box.closest('li').dataset.step);
    if (!s) return;
    s.done = !s.done;
    questWrite(q.id, () => api.request('PATCH', stepPath(q.id, s.id), { body: { done: s.done } }));
    refreshEditing(el);
  } else if (eco) {
    const ec = state.ecos.find((x) => x.id === eco.dataset.eco);
    if (!ec) return;
    ec.unlocked = !ec.unlocked;
    remote.write(['eco:' + ec.id], () => api.request('PATCH', `/v1/ecos/${encodeURIComponent(ec.id)}`, { body: { unlocked: ec.unlocked } }));
    refreshEditing(el);
  }
}
function onCardInput(e) {
  const t = e.target, k = t.dataset.k, el = view.zEl, q = el && qById(el.dataset.id);
  if (!q || !k || !t.isConnected) return;
  /* els camps de text ja s'han llegit amb «input»; un «change» tardà (p. ex. quan la fitxa es torna a pintar) no compta */
  if (e.type === 'change' && t.tagName !== 'SELECT') return;
  if (e.type === 'input' && t.tagName === 'SELECT') return;
  if (k === 'place') {
    q.towns = { ...q.towns, [TOWN_ID]: t.value || null };
    questWrite(q.id, () => api.request('PUT', `/v1/quests/${encodeURIComponent(q.id)}/towns/${TOWN_ID}`, { body: { place: q.towns[TOWN_ID] } }));
    return;
  }
  q[k] = t.value;
  applyDoc(el, q, el._g);
  /* s'envia quan es para d'escriure */
  remote.setEditing(qKey(q.id), true);
  clearTimeout(cardT[k]);
  cardT[k] = setTimeout(() => {
    patchQuest(q.id, { [k]: q[k] });
    remote.setEditing(qKey(q.id), false);
  }, 400);
}
function onCardClick(e) {
  const b = closestIn(e.target, 'button'), el = view.zEl, q = b && el && qById(el.dataset.id);
  if (!q) return;
  if (b.dataset.cat) {
    q.cat = b.dataset.cat;
    patchQuest(q.id, { cat: q.cat });
    renderBoard(true);
    const g = board.slots[q.id];
    if (g && !el._temp) el._g = g;
    applyDoc(el, q, el._g, true);
    gsap.to(el, Object.assign({ duration: 0.4 * D }, zoomTarget(el._g)));
    renderDmCard();
  } else if (b.dataset.town) {
    const k = b.dataset.town, on = k in q.towns;
    if (on && Object.keys(q.towns).length === 1) { toast('La missió ha de sortir com a mínim en un tauler.'); return; }
    const towns = { ...q.towns };
    if (on) delete towns[k]; else towns[k] = null;
    q.towns = towns;
    const path = `/v1/quests/${encodeURIComponent(q.id)}/towns/${k}`;
    questWrite(q.id, () => (on ? api.request('DELETE', path) : api.request('PUT', path, { body: { place: null } })));
    if (!onBoard(q)) { toast('La missió ja no surt en aquest tauler.'); closeDoc().then(() => renderBoard(true)); return; }
    renderDmCard();
  } else if (b.dataset.q) questAction(b.dataset.q);
}
function onBarClick(e) {
  const b = closestIn(e.target, '[data-dm]');
  if (!b) return;
  const a = b.dataset.dm;
  if (arrange.on && (a === 'new' || a === 'import' || a === 'exit' || a === 'history')) setArrange(false);
  if (a === 'arrange') setArrange(!arrange.on);
  else if (a === 'pixel') startPixel();
  else if (a === 'viewer') askViewer();
  else if (a === 'new') newQuest();
  else if (a === 'history') toggleHistory();
  else if (a === 'exit') setDm(false);
  else if (a === 'export') exportFile();
  else if (a === 'import') E.impFile.click();
}

/* ---------- historial, còpies i dispositius ---------- */
let histOpen = false, armedRestore = null;
const ago = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ara mateix';
  if (s < 3600) return `fa ${Math.round(s / 60)} min`;
  if (s < 86400) return `fa ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
};
const REASONS = { manual: 'Feta pel DM', nightly: 'De cada nit', 'pre-import': 'Abans d’importar', 'pre-restore': 'Abans de restaurar' };
async function renderHistory() {
  const h = E.hist;
  h.innerHTML = '<div class="hs-k">Historial</div><p class="hs-x">Carregant…</p>';
  try {
    const [c, sn, se] = await Promise.all([
      api.request('GET', '/v1/history?limit=40'),
      api.request('GET', '/v1/snapshots'),
      api.request('GET', '/v1/sessions')
    ]);
    if (!histOpen) return;
    h.innerHTML = `<button type="button" class="hs-close" data-h="close" title="Tancar">×</button>
      <div class="hs-k">Historial</div>
      <h3>Canvis</h3>
      <ul class="hs-list">${c.changes.map((x) => `<li><span class="hs-t">${esc(x.summary)}</span><span class="hs-w">${ago(x.at)}</span>${x.undoable ? `<button type="button" class="btn" data-h="undo" data-rev="${x.rev}">Desfer</button>` : x.undoneBy ? '<em>desfet</em>' : ''}</li>`).join('') || '<li class="hs-x">Encara no hi ha cap canvi.</li>'}</ul>
      <h3>Còpies <button type="button" class="btn" data-h="snap">Fer-ne una ara</button></h3>
      <ul class="hs-list">${sn.snapshots.slice(0, 15).map((x) => `<li><span class="hs-t">${esc(x.label || REASONS[x.reason] || x.reason)}</span><span class="hs-w">${ago(x.at)}</span><button type="button" class="btn${armedRestore === x.id ? ' warn' : ''}" data-h="restore" data-id="${x.id}">${armedRestore === x.id ? 'Segur?' : 'Restaurar'}</button></li>`).join('') || '<li class="hs-x">Encara no n’hi ha cap.</li>'}</ul>
      <h3>Dispositius</h3>
      <ul class="hs-list">${se.sessions.map((x) => `<li><span class="hs-t">${esc(x.label || 'Dispositiu')}${x.current ? ' <em>(aquest)</em>' : ''}</span><span class="hs-w">${x.role === 'dm' ? 'DM · ' : ''}${ago(x.lastSeenAt)}</span>${x.current ? '' : `<button type="button" class="btn" data-h="revoke" data-id="${esc(x.id)}">Treure</button>`}</li>`).join('')}</ul>`;
  } catch (e) {
    h.innerHTML = `<button type="button" class="hs-close" data-h="close">×</button><div class="hs-k">Historial</div><p class="hs-x">No s’ha pogut carregar: ${esc(e.message)}</p>`;
  }
}
function toggleHistory() {
  if (histOpen) { closeHistory(); return; }
  if (view.zoom) closeAny();
  histOpen = true;
  E.hist.classList.add('on');
  gsap.fromTo(E.hist, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.35 * D, ease: 'power3.out', overwrite: 'auto' });
  renderDmBar();
  renderHistory();
}
function closeHistory() {
  if (!histOpen) return;
  histOpen = false;
  armedRestore = null;
  E.hist.classList.remove('on');
  gsap.to(E.hist, { opacity: 0, x: 40, duration: 0.25 * D, overwrite: 'auto' });
  renderDmBar();
}
async function onHistClick(e) {
  const b = closestIn(e.target, '[data-h]');
  if (!b) return;
  const a = b.dataset.h;
  try {
    if (a === 'close') { closeHistory(); return; }
    await remote.whenIdle();
    if (a === 'undo') { await api.request('POST', `/v1/history/${b.dataset.rev}/undo`); toast('Canvi desfet.'); }
    else if (a === 'snap') { await api.request('POST', '/v1/snapshots', { body: {} }); toast('Còpia feta.'); }
    else if (a === 'restore') {
      const id = Number(b.dataset.id);
      if (armedRestore !== id) { armedRestore = id; renderHistory(); return; }
      armedRestore = null;
      await api.request('POST', `/v1/snapshots/${id}/restore`);
      toast('Còpia restaurada. N’hi ha una de l’estat d’abans per si de cas.', 4200);
    } else if (a === 'revoke') { await api.request('DELETE', `/v1/sessions/${encodeURIComponent(b.dataset.id)}`); toast('Dispositiu tret: haurà de tornar a entrar.'); }
  } catch (err) {
    toast(err.message, 4200);
  }
  if (histOpen) renderHistory();
}

/* =================================================================== entrada */
let hintGone = false;
function firstInput() {
  if (hintGone) return;
  hintGone = true;
  gsap.to(E.hint, { opacity: 0, duration: 0.4 * D, onComplete: () => { E.hint.hidden = true; } });
}
function setInput(kind) {
  stage.classList.toggle('kb', kind !== 'mouse');
  if (inputKind !== kind) { inputKind = kind; renderPrompts(); }
}
function fullscreen() {
  const d = document.documentElement;
  if (!document.fullscreenElement) { if (d.requestFullscreen) d.requestFullscreen().catch(() => {}); }
  else if (document.exitFullscreen) document.exitFullscreen();
}
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
/* accions de teclat i comandament: up/down/left/right, ok, back i map */
function act(a) {
  if (arrange.on) return;
  if (view.zoom === 'map') {
    if (DIRS[a]) placeNav(...DIRS[a]);
    else if (a === 'ok') {
      if (!view.place) placeNav(1, 0);
      else if (view.place === 'tauler') closeMap();
      else if (view.card === view.place) { const qs = questsAt(view.place); if (qs[0]) openDoc(qs[0].id); }
      else openCard(view.place);
    } else if (a === 'back') { if (view.card) closeCard(); else closeMap(); }
    else if (a === 'map') closeMap();
    return;
  }
  if (a === 'up' || a === 'down') { if (!view.zoom) navDir(...DIRS[a]); }
  else if (a === 'left' || a === 'right') { if (view.zoom) stepZoom(DIRS[a][0]); else navDir(...DIRS[a]); }
  else if (a === 'ok') { if (!view.zoom) { if (view.focus) openKey(view.focus); else navDir(1, 0); } }
  else if (a === 'back') { if (view.zoom) closeAny(); }
  else if (a === 'map') openMap();
}
const typing = (t) => closestIn(t, 'input,textarea,select,[contenteditable]');
const KEY_ACTS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', m: 'map', M: 'map' };
function onKey(e) {
  if (gateOpen() || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  /* amb el mapa en píxel a sobre, el tauler no es toca: Esc hi torna */
  if (pixelOn()) {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); toBoard(); }
    else if (k === 'd' && dmOn) setDm(false);
    else if (k === 'f') fullscreen();
    return;
  }
  firstInput();
  setInput('kb');
  if (arrange.on && e.key === 'Escape') { e.preventDefault(); setArrange(false); return; }
  if (histOpen && e.key === 'Escape') { e.preventDefault(); closeHistory(); return; }
  const k = e.key.toLowerCase();
  if (KEY_ACTS[e.key]) { e.preventDefault(); act(KEY_ACTS[e.key]); }
  else if (k === 'f') fullscreen();
  else if (k === 'd') setDm(!dmOn);
  else if (k === 'p' && dmOn && TOWN.pixel) startPixel();
  else if (k === 'l') cycleFx();
}
function onClick(e) {
  if (gateOpen() || pixelOn()) return;
  firstInput();
  const t = e.target, path = e.composedPath ? e.composedPath() : [];
  if (path.some((n) => n && ['dmbar', 'dmcard', 'chrome', 'gate', 'hist'].includes(n.id))) return;
  if (arrange.on) return;
  if (view.zoom === 'map') {
    const qb = t.closest('#pcard [data-q]');
    if (qb) { openDoc(qb.dataset.q); return; }
    if (t.closest('#pcard')) return;
    const pl = t.closest('.plc');
    if (pl) {
      const id = pl.dataset.p;
      setPlace(id);
      if (id === 'tauler') closeMap(); else if (view.card === id) closeCard(); else openCard(id);
      return;
    }
    if (view.card) closeCard();
    else if (!t.closest('#bmap')) closeMap();
    return;
  }
  if (view.zoom) {
    if (view.zEl && view.zEl.contains(t)) onDocClick(e); else closeDoc();
    return;
  }
  const d = t.closest('.doc');
  if (d) { setFocus(d.dataset.id); openDoc(d.dataset.id); }
  else if (t.closest('#pile')) { setFocus('pile'); openKey('pile'); }
  else if (t.closest('#bmap')) openMap();
}
function onHover(e) {
  if (gateOpen() || pixelOn()) return;
  const t = e.target;
  if (arrange.on) { if (!t.closest('#rhandle')) arrHover(arrKeyAt(t)); return; }
  if (view.zoom === 'map') {
    if (t.closest('#pcard')) return;
    const pl = t.closest('.plc');
    setPlace(pl ? pl.dataset.p : view.card);
    return;
  }
  if (view.zoom) return;
  const el = t.closest('.doc, #pile, #bmap');
  if (!el) return;
  const key = el.id === 'pile' ? 'pile' : el.id === 'bmap' ? 'map' : el.dataset.id;
  if (key !== view.focus) setFocus(key);
}
/* el comandament es llegeix cada fotograma només mentre n'hi ha un de connectat: si el bucle corregués sempre,
   mantindria el navegador despert 60 cops per segon sense fer res */
function bindGamepad() {
  const pad = { prev: {}, next: {}, on: false };
  const pads = () => (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []);
  const padStart = () => { if (!pad.on) { pad.on = true; requestAnimationFrame(poll); } };
  function poll(now) {
    const gpd = pads().find((g) => g && g.connected);
    if (!gpd) { pad.on = false; pad.prev = {}; return; }
    if (!gateOpen()) {
      const b = (i) => !!(gpd.buttons[i] && gpd.buttons[i].pressed), ax = gpd.axes || [];
      const st = { up: b(12) || ax[1] < -0.6, down: b(13) || ax[1] > 0.6, left: b(14) || b(4) || ax[0] < -0.6, right: b(15) || b(5) || ax[0] > 0.6, ok: b(0), back: b(1), map: b(3) };
      Object.keys(st).forEach((k) => {
        const was = pad.prev[k];
        /* repetició en mantenir premut: primer cop al cap de 380 ms, després cada 140 ms */
        if (st[k] && (!was || now > (pad.next[k] || 0))) { pad.next[k] = now + (was ? 140 : 380); firstInput(); setInput('pad'); act(k); }
        pad.prev[k] = st[k];
      });
    }
    requestAnimationFrame(poll);
  }
  addEventListener('gamepadconnected', padStart);
  if (pads().some((g) => g && g.connected)) padStart();
}
function bindInput() {
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onClick);
  document.addEventListener('mouseover', onHover);
  /* el cursor s'amaga si no es mou (el tauler sol estar en una pantalla gran) */
  let idleT;
  const wake = () => {
    if (inputKind !== 'mouse') setInput('mouse');
    document.body.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => document.body.classList.add('idle'), 2600);
  };
  document.addEventListener('mousemove', wake);
  wake();
  addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('mousedown', onPanStart);
  document.addEventListener('mousemove', onPanMove);
  document.addEventListener('mouseup', onPanEnd);
  addEventListener('blur', onPanEnd);
  /* el clic del mig no ha d'obrir enllaços ni activar el desplaçament automàtic del navegador */
  document.addEventListener('auxclick', (e) => { if (e.button === 1 && viewOf()) e.preventDefault(); });
  document.addEventListener('pointerdown', arrDown);
  document.addEventListener('pointermove', arrMove);
  document.addEventListener('pointerup', arrUp);
  document.addEventListener('pointercancel', arrUp);
  document.addEventListener('dblclick', (e) => { if (arrange.on) { const k = arrKeyAt(e.target); if (k) arrReset(k); } });
  E.fsBtn.addEventListener('click', fullscreen);
  E.dmBtn.addEventListener('click', () => setDm(!dmOn));
  E.fxBtn.addEventListener('click', cycleFx);
  E.docs.addEventListener('input', onDocInput);
  E.docs.addEventListener('keydown', onDocKey);
  E.docs.addEventListener('focusout', onDocBlur);
  /* només text pla als camps del paper (execCommand és l'única manera d'inserir-lo mantenint el desfer) */
  E.docs.addEventListener('paste', (e) => {
    if (!typing(e.target)) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  E.dmcard.addEventListener('input', onCardInput);
  E.dmcard.addEventListener('change', onCardInput);
  E.dmcard.addEventListener('click', onCardClick);
  E.dmbar.addEventListener('click', onBarClick);
  /* el text d'un lloc s'envia quan es para d'escriure */
  let placeT = null;
  E.pcard.addEventListener('input', (e) => {
    const f = closestIn(e.target, '[data-place]');
    if (!f || !dmOn) return;
    const place = f.dataset.place, text = plainText(f).trim();
    boardData().places[place] = text;
    remote.setEditing('place:' + place, true);
    clearTimeout(placeT);
    placeT = setTimeout(() => {
      savePlace(place, text);
      remote.setEditing('place:' + place, false);
    }, 400);
  });
  E.hist.addEventListener('click', onHistClick);
  E.impFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importFile(f);
    e.target.value = '';
  });
  bindGamepad();
}

/* =================================================================== tauler: inici */
function initBoard() {
  renderLabels();
  E.map.hidden = false;
  E.map.style.height = MAP.h + 'px';
  applyFixed(false);
  gsap.set(E.map, { rotation: MAP.r });
  gsap.set(E.pile, { rotation: PILE.r });
  renderBoard(false);
  renderPrompts();
  bindInput();
  E.chrome.classList.add('show');
  E.hint.hidden = false;
  E.hint.innerHTML = 'Fletxes per triar · <b>↵</b> obrir · <b>M</b> mapa · <b>F</b> pantalla completa';
  setTimeout(firstInput, 9000);
  /* entrada: el mapa cau des de dalt i després els papers, un rere l'altre */
  const tl = gsap.timeline();
  tl.fromTo(E.map, { opacity: 0, y: -40, rotation: -3 }, { opacity: 1, y: 0, rotation: MAP.r, duration: 0.8 * D, ease: 'power3.out' }, 0.1 * D);
  const els = [E.pile].filter((el) => !el.hidden).concat(board.ids.map((id) => docs.get(id)).filter(Boolean));
  els.forEach((el, i) => {
    const at = (0.3 + i * 0.05) * D, o = { duration: 0.55 * D, ease: 'back.out(1.3)' };
    if (el === E.pile) { tl.fromTo(el, { opacity: 0, y: -70, rotation: PILE.r + 9 }, Object.assign({ opacity: 1, y: 0, rotation: PILE.r }, o), at); return; }
    const g = el._g, h = homeOf(g);
    tl.fromTo(el, { opacity: 0, y: h.y - 70, rotation: g.r + 9 }, Object.assign({ opacity: 1, y: h.y, rotation: g.r }, o), at);
  });
}

/* mapa, títol i enllaços als taulers dels altres pobles (abans d'arrencar, perquè el mapa ja es vagi baixant) */
E.mapImg.src = TOWN.map;
E.mapImg.alt = 'Mapa de ' + TOWN.name;
if (TOWN_ID !== 'phentanil') document.title = `Missions de ${TOWN.name} — ${SITE_NAME}`;
$('a', E.chrome).insertAdjacentHTML('afterend', Object.keys(TOWNS).filter((k) => k !== TOWN_ID)
  .map((k) => `<a class="pill" href="${k === 'phentanil' ? './' : '?lloc=' + k}">${esc(TOWNS[k].name)} →</a>`).join(''));

start();

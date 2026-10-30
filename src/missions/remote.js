/* Sincronització del tauler amb l'API.
   - Els canvis del DM s'apliquen de seguida al tauler i s'envien en una cua, d'un en un i en ordre. Sense connexió es
     tornen a provar (el tauler avisa «Sense connexió»); si el servidor en rebutja un, el tauler es torna a carregar.
   - Mentre un element té canvis per enviar (o s'està escrivint), els esdeveniments que en parlen no el toquen: el que
     hi ha al tauler és més nou.
   - L'últim tauler rebut es guarda en aquest navegador, sense res del DM, per ensenyar-lo si el servidor no respon. */
import { ecoView, isFixedPiece, questView } from '@mina/model/visibility';
import * as api from './api.js';
import { local } from './util.js';

const queue = [];
const pending = new Map();
const editing = new Set();
let pumping = false;
const idleWaiters = [];
let status = 'saved';
let handlers = { onStatus: () => {}, onRejected: () => {}, onAuthLost: () => {} };

export function configure(h) {
  handlers = Object.assign({}, handlers, h);
}

/* l'element té canvis del tauler que encara no són al servidor */
export const busy = (key) => editing.has(key) || (pending.get(key) || 0) > 0;
/* s'hi està escrivint (els canvis s'enviaran quan l'escriptura s'aturi) */
export function setEditing(key, on) {
  if (on) editing.add(key);
  else editing.delete(key);
}
export const currentStatus = () => status;

function setStatus(s) {
  if (s === status) return;
  status = s;
  handlers.onStatus(s);
}

/* Envia un canvi. keys: els elements que toca (p. ex. 'quest:q1', 'layout:map'); run: la petició; onDone(resposta);
   onError(error) si el servidor el rebutja (si no n'hi ha, el tauler es recarrega). */
export function write(keys, run, { onDone, onError } = {}) {
  for (const k of keys) pending.set(k, (pending.get(k) || 0) + 1);
  return new Promise((resolve) => {
    queue.push({ keys, run, onDone, onError, resolve });
    pump();
  });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  let delay = 1000;
  while (queue.length) {
    setStatus(status === 'offline' ? 'offline' : 'saving');
    const item = queue[0];
    try {
      const res = await item.run();
      queue.shift();
      release(item);
      delay = 1000;
      if (status === 'offline') setStatus('saving');
      if (item.onDone) item.onDone(res);
      item.resolve(res);
    } catch (e) {
      if (api.isOffline(e)) {
        setStatus('offline');
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 15000);
        continue;
      }
      queue.shift();
      release(item);
      if (e instanceof api.ApiError && e.status === 401) {
        for (const it of queue.splice(0)) release(it);
        handlers.onAuthLost();
      } else if (item.onError) item.onError(e);
      else handlers.onRejected(e);
      item.resolve(null);
    }
  }
  pumping = false;
  setStatus('saved');
  idleWaiters.splice(0).forEach((r) => r());
}

/* quan tot el que hi havia per enviar ja és al servidor */
export const whenIdle = () => (queue.length || pumping ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());
function release(item) {
  for (const k of item.keys) {
    const n = (pending.get(k) || 1) - 1;
    if (n > 0) pending.set(k, n);
    else pending.delete(k);
  }
}

/* avisar abans de tancar la pàgina amb canvis per enviar */
addEventListener('beforeunload', (e) => {
  if (queue.length) e.preventDefault();
});

/* ---------- còpia local per quan el servidor no respon ---------- */
const cacheKey = (town) => 'phx.board.' + town;

/* el tauler tal com el veuria un jugador */
function playerSafe(view) {
  const quests = view.quests.map((q) => questView('player', q)).filter(Boolean);
  const ids = new Set(quests.map((q) => q.id));
  return {
    rev: view.rev,
    role: 'player',
    town: view.town,
    tracked: view.tracked && ids.has(view.tracked) ? view.tracked : null,
    party: view.party,
    quests,
    ecos: view.ecos.map((e) => ecoView('player', e)),
    places: view.places,
    layout: Object.fromEntries(Object.entries(view.layout).filter(([k]) => isFixedPiece(k) || ids.has(k)))
  };
}
export function saveCache(view) {
  local.set(cacheKey(view.town), { at: Date.now(), view: playerSafe(view) });
}
export function loadCache(town) {
  const c = local.get(cacheKey(town));
  return c && c.view ? c : null;
}

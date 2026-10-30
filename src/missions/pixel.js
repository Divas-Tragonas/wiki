/* Mapa en píxel (RPG Map Viewer)
   El DM tria «Mapa en píxel» i el mapa pintat es transforma en el del visor amb una onada de caselles que
   s'aixequen i giren, de la cantonada de dalt a l'esquerra a la de baix a la dreta. Després hi entra la
   pantalla de jugador del visor en directe (iframe de /player?embed=1), que s'eixampla a tota la pantalla i
   segueix la càmera del DM. El visor en mode DM és en una altra finestra: la pantalla incrustada hi parla
   pel WebSocket de la seva API, com la tauleta.
   - L'onada: una casella per casella del mapa del visor (cols×rows), amb el tros del mapa pintat per davant
     i el de píxel per darrere. Animació CSS de transform i opacity (corre al compositor encara que el
     tauler vagi carregat).
   - Encaix: mentre dura l'onada, la pantalla de jugador ensenya el mapa sencer (`fit`), escalat i retallat
     exactament damunt del mapa del tauler; en eixamplar-se, deixa el mapa sencer i llisca cap a la càmera del DM.
   Tot passa fora de l'escenari (#stage), en píxels de la finestra: la pantalla de jugador ha de tenir la mida
   real de la pantalla i no la de l'escenari escalat. */
import { gsap } from 'gsap';
import { $, D, esc, hashOf, local, wait } from './util.js';
import { TOWN } from './current-town.js';
import { stage, toast } from './ui.js';
import { askGate } from './gate.js';

const VIEWER_KEY = 'phx.viewer';
const VIEWER_DEFAULT = 'http://localhost:3001';
const mapImg = $('#mapImg'), labels = $('#labels');

const PX = { on: false, busy: false, phase: '', frame: null, wrap: null, waveEl: null, ready: false, conn: '' };
/* amb el mapa en píxel a sobre, el tauler no respon al ratolí ni al teclat */
export const pixelOn = () => PX.on;

const viewerUrl = () => String(local.get(VIEWER_KEY) || VIEWER_DEFAULT).replace(/\/+$/, '');
const pixelSrc = () => viewerUrl() + '/' + TOWN.pixel.map;

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
    im.onerror = rej;
    im.src = src;
  });
}
function root() {
  let r = $('#px');
  if (!r) { r = document.createElement('div'); r.id = 'px'; document.body.appendChild(r); }
  if (!r.firstChild) {
    r.innerHTML = '<div class="px-bk"></div><div class="px-msg"></div><button type="button" class="px-back" title="Tornar al tauler (Esc)">← Tauler</button>';
    $('.px-back', r).addEventListener('click', () => toBoard());
  }
  r.hidden = false;
  return r;
}
/* rectangle del mapa del tauler, en píxels de la finestra (amb el mapa ampliat no té gir) */
function mapRect() {
  const b = mapImg.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}
/* l'onada: `from` és la imatge de davant (la que es veu ara) i `to` la de darrere (la que queda) */
function wave(R, from, to) {
  const { cols, rows } = TOWN.pixel, tw = R.w / cols, th = R.h / rows;
  const step = 0.03, dur = 0.95, lift = Math.max(tw, th) * 1.6;
  const box = document.createElement('div');
  box.className = 'px-wave';
  Object.assign(box.style, { left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px', perspective: Math.round(R.w * 1.1) + 'px' });
  const bg = (src, x, y) => `background-image:url("${src}");background-size:${R.w}px ${R.h}px;background-position:${-x}px ${-y}px`;
  let h = `<style>.px-wave{--lz:${lift.toFixed(1)}px}</style>`;
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * th), y1 = Math.round((r + 1) * th);
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round(c * tw), x1 = Math.round((c + 1) * tw);
      /* un píxel de més perquè no es vegin les juntes; una mica d'atzar perquè l'onada no sigui una regla */
      const d = ((c + r) * step + ((hashOf(c + ',' + r) % 7) - 3) * 0.004) * D;
      h += `<i style="left:${x0}px;top:${y0}px;width:${x1 - x0 + 1}px;height:${y1 - y0 + 1}px;--d:${d.toFixed(3)}s">` +
        `<b class="f" style='${bg(from, x0, y0)}'></b><b class="k" style='${bg(to, x0, y0)}'></b></i>`;
    }
  }
  box.innerHTML = h;
  box.style.setProperty('--t', (dur * D).toFixed(3) + 's');
  box.classList.toggle('pix-f', from === pixelSrc());
  box.classList.toggle('pix-k', to === pixelSrc());
  const r = root();
  r.insertBefore(box, PX.wrap && PX.wrap.parentNode === r ? PX.wrap : $('.px-msg', r));
  const total = ((cols + rows - 2) * step + 0.02 + dur) * D * 1000;
  void box.offsetWidth; // l'animació comença ara
  box.classList.add('go');
  return { el: box, done: new Promise((res) => setTimeout(res, total + 60)) };
}
/* la pantalla de jugador és de la mida de la finestra: transformació que en posa el mapa damunt de R, i el retall del mapa */
function frameFit(R) {
  const P = TOWN.pixel, W = innerWidth, H = innerHeight, s = Math.min(W / P.w, H / P.h), Mw = P.w * s, Mh = P.h * s, k = R.w / Mw;
  const mx = (W - Mw) / 2, my = (H - Mh) / 2;
  return { x: R.x - k * mx, y: R.y + (R.h - k * Mh) / 2 - k * my, s: k, clip: `inset(${my}px ${mx}px ${my}px ${mx}px)` };
}
function message(txt) {
  const m = $('.px-msg', root());
  m.textContent = txt || '';
  gsap.to(m, { opacity: txt ? 1 : 0, duration: 0.3 * D, overwrite: 'auto' });
}
function showStatus() {
  if (PX.phase !== 'static') return;
  if (PX.conn === 'closed') message('No hi ha connexió amb el visor: comprova que la seva API (port 3000) està engegada.');
  else if (PX.conn === 'open') message('Connectat. Esperant que el DM obri ' + TOWN.name + ' al visor…');
  else message('Connectant amb el visor…');
}
/* la pantalla incrustada avisa quan està connectada i a punt ({ rpg: 'player', ready, conn }) */
addEventListener('message', (e) => {
  if (!PX.frame || e.source !== PX.frame.contentWindow) return;
  const d = e.data;
  if (!d || d.rpg !== 'player') return;
  PX.ready = !!d.ready;
  PX.conn = String(d.conn || '');
  showStatus();
  if (PX.ready && PX.phase === 'static' && !PX.busy) goLive();
});
/* fit: la pantalla de jugador ensenya el mapa sencer (true) o segueix la càmera del DM (false) */
function post(fit) {
  if (PX.frame && PX.frame.contentWindow) PX.frame.contentWindow.postMessage({ rpg: 'embed', fit }, '*');
}

/* prepareMap: el tauler deixa el mapa ampliat, sense fitxes i a la mida inicial (ho fa main.js) */
export async function toPixel(prepareMap) {
  if (!TOWN.pixel || PX.on || PX.busy) return;
  PX.busy = true;
  let pix;
  try {
    pix = await loadImg(pixelSrc());
  } catch (e) {
    PX.busy = false;
    toast(`No trobo el visor a ${viewerUrl()}. És engegat? (Mode DM → «Visor» per canviar l'adreça)`, 5200);
    return;
  }
  PX.on = true; PX.ready = false; PX.conn = ''; PX.phase = 'wave';
  /* la pantalla de jugador es comença a carregar ara: l'onada en dissimula l'espera */
  const r = root();
  const wrap = document.createElement('div');
  wrap.className = 'px-live';
  const fr = document.createElement('iframe');
  fr.src = viewerUrl() + '/player?embed=1&fit=1';
  fr.title = 'Pantalla de jugador';
  fr.tabIndex = -1;
  wrap.appendChild(fr);
  r.insertBefore(wrap, $('.px-msg', r));
  PX.wrap = wrap;
  PX.frame = fr;
  gsap.set(wrap, { opacity: 0 });
  await prepareMap();
  gsap.to(labels, { opacity: 0, duration: 0.3 * D });
  await wait(320);
  const R = mapRect(), f = frameFit(R);
  gsap.set(wrap, { x: f.x, y: f.y, scale: f.s, transformOrigin: '0 0' });
  wrap.style.clipPath = f.clip;
  const w = wave(R, mapImg.src, pix.src);
  PX.waveEl = w.el;
  await w.done;
  PX.phase = 'static';
  PX.busy = false;
  if (PX.ready) goLive(); else showStatus();
}
async function goLive() {
  if (PX.phase !== 'static' || PX.busy) return;
  PX.busy = true; PX.phase = 'going';
  message('');
  await new Promise((res) => gsap.to(PX.wrap, { opacity: 1, duration: 0.7 * D, onComplete: res }));
  if (PX.waveEl) { PX.waveEl.remove(); PX.waveEl = null; }
  PX.phase = 'live';
  /* s'eixampla a tota la pantalla; el tauler queda a fosc darrere i deixa de pintar-se. El retall (només el
     mapa, sense les franges negres de la pantalla) es manté fins al final: a sobre del fons negre no es nota */
  gsap.to('.px-bk', { opacity: 1, duration: 0.9 * D, ease: 'power2.inOut' });
  await new Promise((res) => gsap.to(PX.wrap, { x: 0, y: 0, scale: 1, duration: 1.1 * D, ease: 'power3.inOut', onComplete: res }));
  PX.wrap.style.transform = 'none';
  PX.wrap.style.clipPath = 'none';
  stage.style.visibility = 'hidden';
  post(false);
  PX.busy = false;
}
export async function toBoard() {
  if (!PX.on || PX.busy || PX.phase === 'wave') return;
  PX.busy = true;
  message('');
  const R = mapRect(), pix = pixelSrc();
  if (PX.phase === 'live') {
    /* primer el mapa sencer, després s'encongeix damunt del mapa del tauler */
    post(true);
    await wait(1300);
    stage.style.visibility = '';
    const f = frameFit(R);
    gsap.set(PX.wrap, { x: 0, y: 0, scale: 1, transformOrigin: '0 0' });
    PX.wrap.style.clipPath = f.clip;
    gsap.to('.px-bk', { opacity: 0, duration: 0.9 * D, ease: 'power2.inOut' });
    await new Promise((res) => gsap.to(PX.wrap, { x: f.x, y: f.y, scale: f.s, duration: 1.1 * D, ease: 'power3.inOut', onComplete: res }));
  }
  if (PX.waveEl) { PX.waveEl.remove(); PX.waveEl = null; }
  const w = wave(R, pix, mapImg.src);
  PX.waveEl = w.el;
  if (PX.wrap) {
    const el = PX.wrap;
    await new Promise((res) => gsap.to(el, { opacity: 0, duration: 0.3 * D, onComplete: res }));
    el.remove();
  }
  PX.wrap = null; PX.frame = null; PX.phase = 'wave';
  /* el contingut de l'onada ja és a sota: s'hi pot posar l'animació en marxa */
  await w.done;
  gsap.to(labels, { opacity: 1, duration: 0.4 * D });
  w.el.remove();
  PX.waveEl = null;
  $('#px').hidden = true;
  PX.on = false; PX.busy = false; PX.phase = '';
}
export async function askViewer() {
  await askGate({
    kicker: 'Mode DM', title: 'Adreça del visor', wide: true, type: 'text', ph: VIEWER_DEFAULT, btn: 'Desar', cancel: 'Cancel·lar',
    text: `L'RPG Map Viewer amb ${esc(TOWN.name)} obert en mode DM. Ara: <b>${esc(viewerUrl())}</b>. Des d'aquesta pàgina (https) el navegador només hi deixa entrar per <b>https</b> o per <b>http://localhost</b>.`,
    check: async (val) => {
      let u;
      try { u = new URL(val.trim()); } catch (e) { return 'No és una adreça vàlida (ha de començar per http:// o https://)'; }
      if (!/^https?:$/.test(u.protocol)) return 'Ha de començar per http:// o https://';
      if (location.protocol === 'https:' && u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) {
        return 'Des d’una pàgina https el navegador bloqueja http:// d’una altra màquina. Fes servir http://localhost o una adreça https.';
      }
      local.set(VIEWER_KEY, (u.origin + u.pathname).replace(/\/+$/, ''));
      toast('Visor: ' + viewerUrl());
      return null;
    }
  });
}

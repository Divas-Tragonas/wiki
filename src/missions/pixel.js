/* Mapa en píxel (RPG Map Viewer)
   El DM tria «Mapa en píxel» i el mapa pintat es transforma en el del visor amb una onada de caselles que
   s'aixequen i giren, de la cantonada de dalt a l'esquerra a la de baix a la dreta. Després hi entra la
   pantalla de jugador del visor en directe (iframe de /player?embed=1), que s'eixampla a tota la pantalla i
   segueix la càmera del DM.
   - Sense API: el DM obre aquest tauler des del visor (menú Pantalles → «Obrir el tauler de missions») i el
     tauler parla amb el visor pel seu `window.opener`. El visor hi envia el mateix que envia a les pantalles
     del mateix ordinador i el tauler ho passa a la pantalla incrustada, i al revés (sobre `{ rpg: 'bc', msg }`;
     `lib/relay.ts` del visor). Dins de l'iframe el canal del navegador no serviria: queda aïllat perquè és
     d'un altre lloc. La salutació (`bc-hello`) porta on és el visor: d'aquí surten l'iframe i el mapa en píxel.
   - L'onada: una casella per casella del mapa del visor (cols×rows), amb el tros del mapa pintat per davant
     i el de píxel per darrere. Animació CSS de transform i opacity (corre al compositor encara que el
     tauler vagi carregat).
   - Encaix: mentre dura l'onada, la pantalla de jugador ensenya el mapa sencer (`fit`), escalat i retallat
     exactament damunt del mapa del tauler; en eixamplar-se, deixa el mapa sencer i llisca cap a la càmera del DM.
   Tot passa fora de l'escenari (#stage), en píxels de la finestra: la pantalla de jugador ha de tenir la mida
   real de la pantalla i no la de l'escenari escalat. */
import { gsap } from 'gsap';
import { $, D, hashOf, wait } from './util.js';
import { TOWN } from './current-town.js';
import { stage, toast } from './ui.js';

const mapImg = $('#mapImg'), labels = $('#labels');

const PX = { on: false, busy: false, phase: '', frame: null, wrap: null, waveEl: null, ready: false, pixImg: null, marginBox: null, marginEls: null };
/* amb el mapa en píxel a sobre, el tauler no respon al ratolí ni al teclat */
export const pixelOn = () => PX.on;

/* el visor que ha obert aquest tauler: `base` (on és, amb la carpeta) i `origin` arriben amb la seva salutació */
const VW = { win: window.opener || null, base: '', origin: '' };
const linked = () => !!(VW.win && !VW.win.closed && VW.origin);
const pixelSrc = () => VW.base + '/' + TOWN.pixel.map;
if (TOWN.pixel && VW.win) {
  /* fins que el visor contesta */
  const hello = () => { if (!VW.origin && VW.win && !VW.win.closed) VW.win.postMessage({ rpg: 'bc-hello' }, '*'); };
  hello();
  setInterval(hello, 3000);
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
    im.onerror = rej;
    im.src = src;
  });
}
/* show: false per preparar-hi coses sense ensenyar-lo (la pantalla de jugador es carrega amagada) */
function root(show = true) {
  let r = $('#px');
  if (!r) { r = document.createElement('div'); r.id = 'px'; r.hidden = true; document.body.appendChild(r); }
  if (!r.firstChild) {
    r.innerHTML = '<div class="px-bk"></div><div class="px-msg"></div><button type="button" class="px-back" title="Tornar al tauler (Esc)">← Tauler</button>';
    $('.px-back', r).addEventListener('click', () => toBoard());
  }
  if (show) r.hidden = false;
  return r;
}
/* La pantalla de jugador es carrega tan bon punt el visor saluda, amagada (display: none: no pinta ni gasta
   fotogrames) però rebent la partida. Així en prémer P ja és a punt i no es carrega mentre dura l'onada: carregar-la
   alhora (React, el mapa, els fulls de sprites) era el que feia anar a batzegades l'ampliació del mapa i l'onada. */
function ensureFrame() {
  if (PX.frame) return;
  const r = root(false);
  const wrap = document.createElement('div');
  wrap.className = 'px-live';
  wrap.style.display = 'none';
  const fr = document.createElement('iframe');
  fr.src = VW.base + '/player?embed=1&fit=1';
  fr.title = 'Pantalla de jugador';
  fr.tabIndex = -1;
  wrap.appendChild(fr);
  r.insertBefore(wrap, $('.px-msg', r));
  PX.wrap = wrap;
  PX.frame = fr;
}
/* rectangle del mapa del tauler, en píxels de la finestra (amb el mapa ampliat no té gir) */
function mapRect() {
  const b = mapImg.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}
/* l'onada, pintada en un sol llenç: `from` és la imatge de davant (la que es veu ara) i `to` la de darrere (la que
   queda); `pixTo` diu quina de les dues és el mapa en píxel (es pinta sense suavitzar).
   Cada casella s'aixeca (es fa més gran i fa ombra), gira 180° sobre la seva diagonal i torna a baixar. El gir sobre
   la diagonal vist des de dalt és una transformació afí (l'eix es queda igual i la direcció perpendicular s'escurça
   amb el cosinus), així que n'hi ha prou amb setTransform + drawImage: res de 3D al DOM. La v1 tenia 900 elements
   amb preserve-3d i anava a batzegades. Les caselles acabades es copien un sol cop a `done` i cada fotograma només es
   pinten les que són a mig girar. Les dues imatges es reescalen abans a la mida de pantalla (el mapa pintat fa
   4950 px i a més d'una GPU no hi cap com a textura). */
const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c.getContext('2d'); };
const waveDpr = () => Math.min(2, window.devicePixelRatio || 1);
/* Les dues imatges, reescalades a la mida de pantalla del mapa. createImageBitmap ho fa fora del fil principal
   (reescalar el mapa pintat de 4950 px amb drawImage costava un fotograma sencer just quan començava l'onada).
   Es guarden: l'onada de tornada fa servir les mateixes. */
const _scaled = new Map(), _ids = new WeakMap();
const idOf = (img) => { if (!_ids.has(img)) _ids.set(img, img.src || 'canvas' + _ids.size); return _ids.get(img); };
function scaled(img, pixel, R) {
  const W = Math.round(R.w * waveDpr()), H = Math.round(R.h * waveDpr()), key = idOf(img) + '|' + W + 'x' + H;
  if (!_scaled.has(key)) {
    const viaCanvas = () => {
      const x = canvas2d(W, H);
      x.imageSmoothingEnabled = !pixel; x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, W, H);
      return x.canvas;
    };
    const p = window.createImageBitmap
      ? createImageBitmap(img, { resizeWidth: W, resizeHeight: H, resizeQuality: pixel ? 'pixelated' : 'high' }).catch(viaCanvas)
      : Promise.resolve(viaCanvas());
    _scaled.set(key, p);
  }
  return _scaled.get(key);
}
/* El marge de paper del mapa pintat. El de Cony Cirera s'esvaeix a les vores com una aquarel·la gastada (el color
   perd pigment fins a quedar el paper) i el de píxel s'hi talla en sec: a l'onada es notava molt que hi faltava.
   - On: es treu del mateix mapa pintat, un sol cop. Com més clar és un punt de la vora respecte de l'interior, més
     gastat (`fade`, 0..1). Així les clapes blanques queden on són a l'original i no canvien en girar les caselles.
   - Com: es treu pigment al mapa en píxel, no s'hi posa blanc a sobre. Cada canal és una transmitància (v/255) i el
     punt gastat és paper × transmitància^(1 − fade): el verd fosc es fa verd pàl·lid, com l'aquarel·la. ⚠️ Un vel
     blanc semitransparent (la primera versió) feia gris el verd fosc i semblaven núvols.
   Res de ctx.filter per al desenfocament (Safari): tres caixes. */
let _fade = null;
function fadeMask() {
  if (!_fade) {
    _fade = (mapImg.decode ? mapImg.decode() : Promise.resolve()).catch(() => {})
      .then(() => fadeOf(mapImg))
      .catch(() => null);
  }
  return _fade;
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), n = 2 * r + 1;
  const a = src, b = tmp;
  for (let pass = 0; pass < 3; pass++) {
    /* horitzontal a → b, vertical b → a (amb les vores repetides) */
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[o + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        b[o + x] = acc / n;
        acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += b[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / n;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}
/* → { w, h, a: Float32Array (fade 0..1), paper: [r, g, b] } o null si el mapa no té marge de paper */
function fadeOf(img) {
  if (!img.naturalWidth) return null;
  const k = Math.min(1, 1100 / img.naturalWidth), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const x = canvas2d(w, h);
  x.drawImage(img, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data, N = w * h;
  const mn = new Float32Array(N); // el canal més fosc: el paper el té alt, l'herba i els arbres baix
  for (let i = 0, j = 0; i < N; i++, j += 4) mn[i] = Math.min(px[j], px[j + 1], px[j + 2]);
  /* distància a la vora més propera i fins on arriba el marge (com a molt un 6% del mapa) */
  const inner = w * 0.023, outer = w * 0.056;
  const dist = (i) => { const cx = i % w, cy = (i / w) | 0; return Math.min(cx, w - 1 - cx, cy, h - 1 - cy); };
  /* color del paper (els punts més blancs de la vora) i to mitjà de l'interior */
  let pr = 0, pg = 0, pb = 0, pn = 0, cs = 0, cn = 0;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const d = dist(i);
    if (d < outer && mn[i] > 228) { pr += px[j]; pg += px[j + 1]; pb += px[j + 2]; pn++; }
    else if (d > w * 0.15) { cs += mn[i]; cn++; }
  }
  if (pn < 50 || !cn) return null;
  pr /= pn; pg /= pn; pb /= pn;
  const C = cs / cn, P = Math.min(pr, pg, pb);
  if (P - C < 30) return null;
  const bl = boxBlur(mn, w, h, Math.max(1, Math.round(w / 450)));
  const a = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = dist(i);
    if (d >= outer) continue;
    const t = Math.min(1, Math.max(0, (d - inner) / (outer - inner)));
    a[i] = Math.min(1, Math.max(0, ((bl[i] - C) / (P - C)) * 1.3)) * (1 - t * t * (3 - 2 * t));
  }
  return { w, h, a, paper: [pr, pg, pb] };
}
/* Les capes de la vora gastada, a la mida del fade (s'amplien en dibuixar-les): { lights, white, paper }.
   T^(1 − fade) es fa sense llegir píxels: soft-light amb blanc és (gairebé) l'arrel quadrada, o sigui que tres
   passades de blanc en soft-light porten T a T^½, T^¼ i T^⅛, i cada passada només on el fade ha passat el tram
   anterior (màscares `lights`); a l'últim tram, blanc normal (`white`). Després × paper (`paper`, amb gra; blanc a
   dins). ⚠️ No es pot llegir el mapa en píxel: ve del visor, en un altre lloc i sense CORS.
   Les mateixes capes serveixen per a l'onada (dibuixades amb globalCompositeOperation) i per a la pantalla de
   jugador (com a elements amb mix-blend-mode): així la vora no depèn de cap mapa concret. Gasta el que hi hagi a
   sota, també si es torna a generar el mapa del visor o si la pantalla ensenya un altre lloc (la colla dins d'una
   casa). */
const SL_STEPS = [0.5, 0.75, 0.875, 1]; // fade on s'arriba a T^½, T^¼, T^⅛ i al blanc
let _layers = null;
function fadeLayers() {
  if (!_layers) {
    _layers = fadeMask().then((F) => {
      if (!F) return null;
      const N = F.w * F.h;
      const mk = () => { const x = canvas2d(F.w, F.h); return { x, im: x.createImageData(F.w, F.h) }; };
      const steps = SL_STEPS.map(mk), paper = mk();
      let seed = 1;
      const rnd = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0) >>> 0) / 4294967296;
      const bw = Math.ceil(F.w / 3) + 1, blk = new Float32Array(bw * (Math.ceil(F.h / 3) + 1));
      for (let i = 0; i < blk.length; i++) blk[i] = rnd() - 0.5;
      for (let i = 0, j = 0; i < N; i++, j += 4) {
        const f = F.a[i];
        for (const m of steps) m.im.data[j] = m.im.data[j + 1] = m.im.data[j + 2] = 255;
        if (f <= 0) { paper.im.data[j] = paper.im.data[j + 1] = paper.im.data[j + 2] = paper.im.data[j + 3] = 255; continue; }
        let lo = 0;
        for (let k = 0; k < SL_STEPS.length; k++) {
          steps[k].im.data[j + 3] = Math.min(1, Math.max(0, (f - lo) / (SL_STEPS[k] - lo))) * 255;
          lo = SL_STEPS[k];
        }
        /* paper amb gra (un soroll per punt i un altre per blocs de 3), barrejat amb blanc segons el fade */
        const g = 1 + (rnd() - 0.5) * 0.05 + blk[((((i / F.w) | 0) / 3) | 0) * bw + (((i % F.w) / 3) | 0)] * 0.04;
        for (let c = 0; c < 3; c++) paper.im.data[j + c] = 255 + (F.paper[c] * g - 255) * f;
        paper.im.data[j + 3] = 255;
      }
      for (const m of [...steps, paper]) m.x.putImageData(m.im, 0, 0);
      return { lights: steps.slice(0, -1).map((m) => m.x.canvas), white: steps[steps.length - 1].x.canvas, paper: paper.x.canvas };
    }).catch(() => null);
  }
  return _layers;
}
/* per a l'onada: el mapa en píxel amb la vora gastada (o el de sempre si el mapa pintat no té marge), a la mida de
   pantalla. Es fa a la mida del mapa en píxel i es guarda (una vegada per imatge). */
const _framed = new WeakMap();
function framedFull(pix) {
  if (!_framed.has(pix)) {
    _framed.set(pix, fadeLayers().then((L) => {
      if (!L) return pix;
      const W = pix.naturalWidth, H = pix.naturalHeight, out = canvas2d(W, H);
      out.imageSmoothingEnabled = false;
      out.drawImage(pix, 0, 0);
      out.imageSmoothingEnabled = true;
      out.globalCompositeOperation = 'soft-light';
      for (const c of L.lights) out.drawImage(c, 0, 0, W, H);
      out.globalCompositeOperation = 'source-over';
      out.drawImage(L.white, 0, 0, W, H);
      out.globalCompositeOperation = 'multiply';
      out.drawImage(L.paper, 0, 0, W, H);
      out.globalCompositeOperation = 'source-over';
      return out.canvas;
    }).catch(() => pix));
  }
  return _framed.get(pix);
}
const framed = (pix, R) => framedFull(pix).then((img) => scaled(img, true, R));
/* La vora gastada damunt de la pantalla de jugador, dins de PX.wrap, on la pantalla hi té el mapa sencer: s'amplia i
   s'encongeix amb ella. Es veu mentre ensenya el mapa sencer i s'esvaeix quan s'eixampla a tota la pantalla.
   ⚠️ El contenidor no pot tenir opacitat, transform ni z-index: faria un grup a part i les capes es fondrien amb el
   buit en lloc de amb l'iframe. Per això s'esvaeixen les capes (PX.marginEls), no el contenidor. */
function marginOver(L) {
  if (!L || !PX.wrap) return null;
  if (!PX.marginBox) {
    const box = document.createElement('div');
    box.className = 'px-margin';
    const add = (src, blend) => {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      c.style.mixBlendMode = blend;
      box.appendChild(c);
      return c;
    };
    PX.marginEls = [...L.lights.map((c) => add(c, 'soft-light')), add(L.white, 'normal'), add(L.paper, 'multiply')];
    PX.wrap.appendChild(box);
    PX.marginBox = box;
  }
  const P = TOWN.pixel, W = innerWidth, H = innerHeight, s = Math.min(W / P.w, H / P.h), Mw = P.w * s, Mh = P.h * s;
  Object.assign(PX.marginBox.style, { left: (W - Mw) / 2 + 'px', top: (H - Mh) / 2 + 'px', width: Mw + 'px', height: Mh + 'px' });
  return PX.marginEls;
}
function wave(R, A, B, pixTo) {
  const { cols, rows } = TOWN.pixel;
  const dpr = waveDpr(), W = A.width, H = A.height, tw = W / cols, th = H / rows;
  const step = 0.03, dur = 0.7, lift = 0.5;
  const m = Math.ceil(Math.max(tw, th) * 1.2); // marge del llenç: una casella aixecada en sobresurt
  const done = canvas2d(W, H); // es va omplint amb les caselles ja girades
  done.drawImage(A, 0, 0);
  const cv = document.createElement('canvas');
  cv.className = 'px-wave';
  cv.width = W + 2 * m; cv.height = H + 2 * m;
  Object.assign(cv.style, { left: R.x - m / dpr + 'px', top: R.y - m / dpr + 'px', width: (W + 2 * m) / dpr + 'px', height: (H + 2 * m) / dpr + 'px' });
  const ctx = cv.getContext('2d');
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round(c * tw), y0 = Math.round(r * th), x1 = Math.round((c + 1) * tw), y1 = Math.round((r + 1) * th);
      /* una mica d'atzar perquè l'onada no sigui una regla */
      const d = (c + r) * step + ((hashOf(c + ',' + r) % 7) - 3) * 0.004;
      tiles.push({ x0, y0, w: x1 - x0, h: y1 - y0, d, st: 0 });
    }
  }
  tiles.sort((a, b) => a.d - b.d);
  const total = ((cols + rows - 2) * step + 0.02 + dur) * D;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const draw = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(done.canvas, m, m);
    const live = [];
    for (let i = 0; i < tiles.length; i++) {
      const k = tiles[i];
      if (k.st === 2) continue;
      const p = (t - k.d * D) / (dur * D);
      if (p <= 0) break; // en ordre de sortida: la resta encara no ha començat
      if (p >= 1) { k.st = 2; done.drawImage(B, k.x0, k.y0, k.w, k.h, k.x0, k.y0, k.w, k.h); ctx.drawImage(B, k.x0, k.y0, k.w, k.h, m + k.x0, m + k.y0, k.w, k.h); continue; }
      k.st = 1; k.p = p; k.up = Math.sin(Math.PI * p);
      live.push(k);
    }
    /* primer tots els forats i les ombres, després les cares (les més aixecades a sobre): si no, el forat d'una
       casella tallaria la veïna que ja és enlaire */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(24,16,8,.35)';
    for (const k of live) ctx.fillRect(m + k.x0, m + k.y0, k.w, k.h);
    for (const k of live) {
      const o = k.up * k.w * 0.35;
      ctx.fillStyle = 'rgba(12,8,4,' + (0.28 * k.up).toFixed(3) + ')';
      ctx.fillRect(m + k.x0 + o, m + k.y0 + o, k.w, k.h);
    }
    live.sort((a, b) => a.up - b.up);
    for (const k of live) {
      /* gir sobre la diagonal: davant mentre cos > 0, darrere (que ja ve girada 180°) després */
      const cs = Math.cos(Math.PI * ease(k.p)), back = cs < 0, c2 = back ? -cs : cs, sc = 1 + lift * k.up;
      const a = 0.5 + 0.5 * c2, b = -0.5 + 0.5 * c2;
      ctx.setTransform(sc * a, sc * b, sc * b, sc * a, m + k.x0 + k.w / 2, m + k.y0 + k.h / 2);
      ctx.imageSmoothingEnabled = back ? !pixTo : pixTo;
      ctx.drawImage(back ? B : A, k.x0, k.y0, k.w, k.h, -k.w / 2, -k.h / 2, k.w, k.h);
      /* llum: més fosca com més de cantell, i una mica clara a la cara que puja */
      ctx.fillStyle = 'rgba(10,6,2,' + ((1 - c2) * 0.4).toFixed(3) + ')';
      ctx.fillRect(-k.w / 2, -k.h / 2, k.w, k.h);
      ctx.fillStyle = 'rgba(255,244,214,' + (k.up * 0.18).toFixed(3) + ')';
      ctx.fillRect(-k.w / 2, -k.h / 2, k.w, k.h);
    }
  };
  const r = root();
  r.insertBefore(cv, PX.wrap && PX.wrap.parentNode === r ? PX.wrap : $('.px-msg', r));
  draw(0);
  return {
    el: cv,
    done: new Promise((res) => {
      const t0 = performance.now();
      const frame = (now) => {
        const t = (now - t0) / 1000;
        if (t >= total) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(B, m, m); res(); return; }
        draw(t);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    })
  };
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
  message(linked() ? 'Esperant que el DM obri ' + TOWN.name + ' al visor…' : "S'ha tancat el visor que havia obert aquest tauler.");
}
addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  /* del visor: la salutació i el canal, que va cap a la pantalla incrustada */
  if (VW.win && e.source === VW.win) {
    if (d.rpg === 'bc-hello' && typeof d.base === 'string') {
      const first = !VW.origin;
      VW.origin = e.origin; VW.base = d.base.replace(/\/+$/, '');
      if (first) {
        ensureFrame();
        /* el mapa en píxel i la seva vora gastada es preparen ja, quan el navegador no té feina */
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 500));
        loadImg(pixelSrc()).then((im) => { PX.pixImg = im; idle(() => framedFull(im), { timeout: 4000 }); }).catch(() => {});
      }
    }
    else if (d.rpg === 'bc' && e.origin === VW.origin && PX.frame && PX.frame.contentWindow) PX.frame.contentWindow.postMessage(d, VW.origin);
    return;
  }
  /* de la pantalla incrustada: el canal, que va cap al visor, i si ja té el mapa ({ rpg: 'player', ready }) */
  if (!PX.frame || e.source !== PX.frame.contentWindow) return;
  if (d.rpg === 'bc') { if (linked()) VW.win.postMessage(d, VW.origin); return; }
  if (d.rpg !== 'player') return;
  PX.ready = !!d.ready;
  showStatus();
  if (PX.ready && PX.phase === 'static' && !PX.busy) goLive();
});
/* fit: la pantalla de jugador ensenya el mapa sencer (true) o segueix la càmera del DM (false) */
function post(fit) {
  if (PX.frame && PX.frame.contentWindow) PX.frame.contentWindow.postMessage({ rpg: 'embed', fit }, VW.origin || '*');
}

/* prepareMap: el tauler deixa el mapa ampliat, sense fitxes i a la mida inicial (ho fa main.js) */
export async function toPixel(prepareMap) {
  if (!TOWN.pixel || PX.on || PX.busy) return;
  if (!linked()) { toast('Obre aquest tauler des del visor: menú «Pantalles» → «Obrir el tauler de missions».', 5200); return; }
  PX.busy = true;
  let pix = PX.pixImg;
  if (!pix) {
    try {
      pix = PX.pixImg = await loadImg(pixelSrc());
    } catch (e) {
      PX.busy = false;
      toast("No s'ha pogut carregar el mapa en píxel del visor.", 4200);
      return;
    }
  }
  PX.on = true; PX.phase = 'wave';
  document.body.classList.add('pixel-on');
  ensureFrame();
  root();
  const wrap = PX.wrap;
  gsap.set(wrap, { opacity: 0 });
  await prepareMap();
  const R = mapRect(), f = frameFit(R);
  const imgs = Promise.all([scaled(mapImg, false, R), framed(pix, R)]);
  gsap.to(labels, { opacity: 0, duration: 0.3 * D });
  await wait(320);
  const [A, B] = await imgs;
  gsap.set(wrap, { x: f.x, y: f.y, scale: f.s, transformOrigin: '0 0' });
  wrap.style.clipPath = f.clip;
  const me = marginOver(await fadeLayers());
  if (me) gsap.set(me, { opacity: 1 });
  const w = wave(R, A, B, true);
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
  /* fins ara no pintava: es mostra transparent i se li deixen uns fotogrames per posar-se a la mida */
  PX.wrap.style.display = '';
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  await wait(150);
  await new Promise((res) => gsap.to(PX.wrap, { opacity: 1, duration: 0.7 * D, onComplete: res }));
  if (PX.waveEl) { PX.waveEl.remove(); PX.waveEl = null; }
  PX.phase = 'live';
  /* s'eixampla a tota la pantalla; el tauler queda a fosc darrere i deixa de pintar-se. El retall (només el
     mapa, sense les franges negres de la pantalla) es manté fins al final: a sobre del fons negre no es nota */
  gsap.to('.px-bk', { opacity: 1, duration: 0.9 * D, ease: 'power2.inOut' });
  if (PX.marginEls) gsap.to(PX.marginEls, { opacity: 0, duration: 1.1 * D, ease: 'power2.in' });
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
  const R = mapRect();
  if (PX.phase === 'live') {
    /* primer el mapa sencer, després s'encongeix damunt del mapa del tauler */
    post(true);
    await wait(1300);
    stage.style.visibility = '';
    const f = frameFit(R);
    gsap.set(PX.wrap, { x: 0, y: 0, scale: 1, transformOrigin: '0 0' });
    PX.wrap.style.clipPath = f.clip;
    gsap.to('.px-bk', { opacity: 0, duration: 0.9 * D, ease: 'power2.inOut' });
    const me = marginOver(await fadeLayers());
    if (me) gsap.to(me, { opacity: 1, duration: 1.1 * D, ease: 'power2.out' });
    await new Promise((res) => gsap.to(PX.wrap, { x: f.x, y: f.y, scale: f.s, duration: 1.1 * D, ease: 'power3.inOut', onComplete: res }));
  }
  if (PX.waveEl) { PX.waveEl.remove(); PX.waveEl = null; }
  const [A, B] = await Promise.all([framed(PX.pixImg, R), scaled(mapImg, false, R)]);
  const w = wave(R, A, B, false);
  PX.waveEl = w.el;
  /* la pantalla de jugador es torna a amagar (sense treure-la): la propera vegada ja serà a punt */
  if (PX.wrap) {
    const el = PX.wrap;
    await new Promise((res) => gsap.to(el, { opacity: 0, duration: 0.3 * D, onComplete: res }));
    el.style.display = 'none';
  }
  PX.phase = 'wave';
  /* el contingut de l'onada ja és a sota: s'hi pot posar l'animació en marxa */
  await w.done;
  gsap.to(labels, { opacity: 1, duration: 0.4 * D });
  w.el.remove();
  PX.waveEl = null;
  $('#px').hidden = true;
  PX.on = false; PX.busy = false; PX.phase = '';
  document.body.classList.remove('pixel-on');
}

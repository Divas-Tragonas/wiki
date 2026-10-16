/* Tauler de missions · La Mina Perduda del Phentanilo
   - Les dades viuen a data.json, xifrades: una part per al grup (contrasenya del grup) i una altra
     amb tot (missions ocultes, notes) per al DM (contrasenya del DM).
   - Cada paper del tauler és el document sencer a escala; en clicar-lo s'acosta el mateix paper.
   - El mode DM edita els mateixos papers i publica al repositori del wiki amb l'API de GitHub. */
(function () {
  'use strict';

  /* =================================================================== utilitats */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = reduce ? 0.01 : 1;
  const FORCE_GL = /[?&]gl=1/.test(location.search);
  const hashOf = (s, m) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h + (m || 0) * 7919) % 100003; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * D));

  /* GSAP, o una versió mínima que aplica els valors finals si no carrega */
  const G = window.gsap || (function () {
    const arr = (t) => (typeof t === 'string' ? $$(t) : t == null ? [] : (t.length != null && !t.nodeType ? Array.from(t) : [t]));
    const apply = (t, v) => arr(t).forEach((el) => {
      if (!el || !el.style) { if (el) Object.keys(v).forEach((k) => { if (typeof v[k] === 'number') el[k] = v[k]; }); return; }
      ['left', 'top', 'width', 'height'].forEach((k) => { if (k in v) el.style[k] = v[k] + 'px'; });
      if ('opacity' in v) el.style.opacity = v.opacity;
      const st = el._t || (el._t = { x: 0, y: 0, scale: 1, rotation: 0 });
      ['x', 'y', 'scale', 'rotation'].forEach((k) => { if (k in v) st[k] = v[k]; });
      el.style.transform = `translate(${st.x}px,${st.y}px) rotate(${st.rotation}deg) scale(${st.scale})`;
    });
    const done = (v) => { if (v && v.onComplete) setTimeout(v.onComplete, 0); };
    return { set: (t, v) => apply(t, v), to: (t, v) => { apply(t, v); done(v); }, fromTo: (t, a, b) => { apply(t, b); done(b); }, killTweensOf() {}, getProperty: (el, k) => (el._t ? el._t[k === 'scaleX' || k === 'scaleY' ? 'scale' : k] : 0) || 0 };
  })();
  const gp = (el, k) => +G.getProperty(el, k) || 0;

  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const LSK = { kp: 'phx.kp', kd: 'phx.kd', work: 'phx.work', tok: 'phx.gh' };
  const GH = { owner: 'divas-tragonas', repo: 'wiki', path: 'public/missions/data.json', branch: 'master' };

  /* =================================================================== xifratge */
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const norm = (p) => String(p || '').trim().toLowerCase().replace(/\s+/g, ' ');
  async function derive(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(norm(pass)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(salt), iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function unseal(key, blob) {
    try { return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(blob.iv) }, key, b64d(blob.ct)))); } catch (e) { return null; }
  }
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
  }
  const keyOut = async (k) => b64e(new Uint8Array(await crypto.subtle.exportKey('raw', k)));
  const keyIn = async (s) => { try { return await crypto.subtle.importKey('raw', b64d(s), 'AES-GCM', true, ['encrypt', 'decrypt']); } catch (e) { return null; } };

  /* =================================================================== dades fixes */
  const CATS = { principal: 'Missió principal', secundaria: 'Missió secundària', personal: 'Missió personal' };
  const catOf = (q) => (CATS[q.cat] ? q.cat : 'secundaria');
  const isDone = (q) => q.status === 'done';
  const giverLine = (g) => (!g ? '' : /^(una|un|la|el|les|els|decisi|ell|oghma)/i.test(g) ? g : 'Encàrrec de ' + g);

  /* textures de paper: proporció i marges segurs (vores estripades) en fracció [dalt, dreta, baix, esquerra] */
  const PAPER = {
    1: { ar: 0.707, i: [0.01, 0.01, 0.011, 0.023] }, '1r': { ar: 1.414, i: [0.023, 0.01, 0.01, 0.011] },
    2: { ar: 0.733, i: [0.016, 0.033, 0.011, 0.022] }, '2r': { ar: 1.365, i: [0.022, 0.016, 0.033, 0.011] },
    3: { ar: 0.715, i: [0.012, 0.025, 0.014, 0.015] }, '3r': { ar: 1.399, i: [0.015, 0.012, 0.025, 0.014] },
    4: { ar: 0.701, i: [0.005, 0.007, 0.005, 0.007] }, '4r': { ar: 1.426, i: [0.007, 0.005, 0.007, 0.005] },
    5: { ar: 0.734, i: [0.01, 0.012, 0.011, 0.015] }, '5r': { ar: 1.362, i: [0.015, 0.01, 0.012, 0.011] },
    6: { ar: 0.687, i: [0.033, 0.033, 0.023, 0.033] }, '6r': { ar: 1.455, i: [0.033, 0.033, 0.033, 0.023] },
    7: { ar: 0.509, i: [0.019, 0.033, 0.024, 0.037] }
  };
  const TEX = { principal: ['2', '6', '3', '5'], secundaria: ['1', '3', '5', '4', '2'], personal: ['4', '1', '5'] };

  /* llocs del mapa: noms i fletxes redibuixats amb la tipografia (coordenades del mapa de 4950×3510) */
  const GEOM = [{"id":"cami-tres-bous","name":"Camí dels Tres Bous","ar":[2553,141,2721,93],"ln":[["CAMÍ dels",2302,140,201],["TRES BOUS",2268,178,252]]},{"id":"can-bertran","name":"Can Bertran","ar":[2837,423,2691,521],"ln":[["CAN BERTRAN",2692,391,334]]},{"id":"mansio-cendra","name":"Mansió de la Cendra","ar":[4580,524,4560,383],"ln":[["MANSIÓ de la",4448,579,283],["CENDRA",4495,618,195]]},{"id":"ferreria","name":"Ferreria","ar":[2375,589,2266,714],"ln":[["FERRERIA",2300,558,249]]},{"id":"casa-bertran","name":"Casa Bertran","ar":[3151,619,2939,681],"ln":[["CASA BERTRAN",3027,570,351]]},{"id":"casa-sor-maria","name":"Casa Sor Maria","ar":[1718,609,1890,898],"ln":[["CASA SOR MARIA",1539,569,379]]},{"id":"gegant-durment","name":"Gegant Durment","ar":[3557,664,3384,750],"ln":[["GEGANT",3511,592,193],["DURMENT",3487,629,239]]},{"id":"santuari-sort","name":"Santuari de la Sort","ar":[1952,732,1977,982],"ln":[["SANTUARI",1919,669,229],["de la SORT",1926,706,214]]},{"id":"hort-damia","name":"Hort d’en Damià","ar":[1008,775,1213,872],"ln":[["HORT d’en DAMIÀ",796,746,378]]},{"id":"alberg-turo","name":"Alberg Turó de la Pedra","ar":[2742,860,2568,862],"ln":[["ALBERG TURÓ",2795,851,329],["de la PEDRA",2828,887,262]]},{"id":"granja-fullaverda","name":"Granja Fullaverda","ar":[4048,1140,3897,1253],"ln":[["GRANJA FULLAVERDA",3716,1109,498]]},{"id":"ajuntament","name":"Ajuntament","ar":[2671,1200,2496,1240],"ln":[["AJUNTAMENT",2696,1180,318]]},{"id":"casa-lluna","name":"Casa Lluna","ar":[1371,1277,1497,1442],"ln":[["CASA LLUNA",1225,1250,283]]},{"id":"tauler","name":"Tauler d’anuncis","icon":[2766,1285,62]},{"id":"casa-arnau","name":"Casa Arnau Ponent","ar":[3532,1366,3389,1279],"ln":[["CASA ARNAU",3307,1389,284],["PONENT",3352,1427,195]]},{"id":"escut-lleo","name":"Companyia Escut de Lleó","ar":[1564,1678,1855,1460],"ln":[["COMPANYIA",1301,1750,273],["ESCUT de LLEÓ",1265,1789,346]]},{"id":"carpinteria","name":"Carpinteria","ar":[2560,1638,2373,1516],"ln":[["CARPINTERIA",2399,1736,325]]},{"id":"llotja-minera","name":"Llotja Minera","ar":[2210,1826,2048,1771],"ln":[["LLOTJA",2240,1867,184],["MINERA",2228,1905,196]]},{"id":"casa-helia","name":"Casa Hèlia","ar":[2851,2231,2618,2093],"ln":[["CASA HÈLIA",2884,2283,278]]},{"id":"cami-miners","name":"Camí dels Miners","ar":[1564,3201,1290,3359],"ln":[["CAMÍ dels MINERS",1653,3193,400]]}];
  const PL = Object.fromEntries(GEOM.map((p) => [p.id, p]));
  const PLACE_INFO = {
    'ajuntament': { text: "On l'alcalde, Arnau Ponent, porta els registres del poble.", href: 'wiki/characters/arnau-ponent' },
    'gegant-durment': { text: 'La taverna El Gegant Dorment, punt de trobada habitual del grup.', href: 'wiki/places/phentanil' },
    'mansio-cendra': { text: "L'antic cau de la Vaina Roja a les afores de Phentanil, ara buidat després de la caiguda de Vara de Vidre.", href: 'wiki/places/mansio-de-la-cendra' },
    'santuari-sort': { text: 'El santuari de Timora, a la plaça central, amb una casoleta màgica que emet purpurina quan hi tires monedes.', href: 'wiki/places/phentanil' },
    'casa-sor-maria': { text: 'La casa de Sor Maria, apartada del carrer principal.', href: 'wiki/characters/sor-maria' },
    'escut-lleo': { text: "L'armeria d'Hèlia Tornegrau, saquejada recentment pels goblins però encara operativa.", href: 'wiki/places/escut-del-lleo' },
    'casa-helia': { text: "Casa d'Hèlia Tornegrau, propietària de l'armeria l'Escut del Lleó.", href: 'wiki/characters/helia-tornegrau' },
    'can-bertran': { text: 'Establiment comercial de Phentanil on el grup va entregar el primer cargament.', href: 'wiki/places/can-bertran' },
    'casa-bertran': { text: 'Casa de Mic Bertran, comerciant de Phentanil i propietari de Can Bertran.', href: 'wiki/characters/mic-bertran' },
    'hort-damia': { text: "L'hort de Damià RoureBlanc, pagès d'edat avançada i vell amic de Sor Maria.", href: 'wiki/characters/damia-roureblanc' },
    'casa-arnau': { text: "Casa d'Arnau Ponent, l'alcalde de Phentanil.", href: 'wiki/characters/arnau-ponent' }
  };

  /* tauler: mapa a dalt a l'esquerra i els llocs dels cartells copiats del tauler de referència */
  const MAP = { x: 28, y: 22, w: 1100, h: 780, r: -0.8, s: 1 };
  const PILE = { x: 60, y: 655, w: 285, h: 398, r: -2, s: 1 };
  const REF = [
    { id: 'B1', cx: 486, cy: 766, w: 450, h: 600, r: 3.5, z: 40 }, { id: 'R1', cx: 1310, cy: 320, w: 346, h: 513, r: -2.2, z: 38 },
    { id: 'B5', cx: 1081, cy: 832, w: 342, h: 427, r: -3, z: 42 }, { id: 'R3', cx: 1505, cy: 755, w: 360, h: 513, r: 1.2, z: 33 },
    { id: 'R2', cx: 1665, cy: 280, w: 378, h: 531, r: 2.2, z: 34 }, { id: 'R4', cx: 1677, cy: 850, w: 315, h: 441, r: 1, z: 44 },
    { id: 'B3', cx: 779, cy: 843, w: 195, h: 317, r: 1, z: 31 }, { id: 'R5', cx: 1801, cy: 680, w: 198, h: 225, r: 2.5, z: 30 },
    { id: 'B4', cx: 849, cy: 957, w: 108, h: 206, r: 0.5, z: 46 }
  ];
  const SLOT_B2 = { id: 'B2', cx: 202, cy: 854, w: 285, h: 398, r: -2, z: 29 };
  const OVER = [
    { cx: 1215, cy: 760, w: 230, h: 300, r: -6, z: 36 }, { cx: 1480, cy: 985, w: 260, h: 170, r: 4, z: 39 },
    { cx: 640, cy: 1000, w: 220, h: 150, r: -4, z: 43 }, { cx: 1180, cy: 160, w: 170, h: 240, r: 7, z: 37 },
    { cx: 1460, cy: 585, w: 210, h: 260, r: -3, z: 35 }, { cx: 905, cy: 640, w: 190, h: 240, r: 5, z: 41 },
    { cx: 1845, cy: 1000, w: 150, h: 150, r: -5, z: 45 }, { cx: 1880, cy: 520, w: 150, h: 200, r: 6, z: 28 },
    { cx: 1020, cy: 560, w: 180, h: 150, r: -7, z: 39 }, { cx: 330, cy: 560, w: 170, h: 210, r: -5, z: 39 }
  ];
  const SLOT_PREF = {
    principal: ['B1', 'R1', 'B5', 'R3', 'R2', 'R4', 'B3', 'B2', 'R5', 'B4'],
    personal: ['R5', 'B3', 'B4', 'B2', 'R4', 'R2'],
    secundaria: ['R2', 'R4', 'B3', 'B4', 'R5', 'B2', 'R3', 'B5', 'R1', 'B1']
  };
  const FOC = 1.022, FOCM = 1.006, FOCR = 0.8; // focus/hover molt lleu
  const MAPZ = 1.27;

  /* =================================================================== estat */
  let REMOTE = null, KP = null, KD = null, PUB = null, FULL = null, WORK = null;
  let S = null, L = null, dmOn = false;
  const T = { focus: null, zoom: null, zEl: null, place: null, card: null };
  const docs = new Map();
  let input = 'kb';
  const stage = $('#stage');

  function normState(s) {
    s = s || {};
    s.quests = Array.isArray(s.quests) ? s.quests : [];
    s.ecos = Array.isArray(s.ecos) ? s.ecos : [];
    s.places = s.places && typeof s.places === 'object' ? s.places : {};
    s.party = s.party || { level: 1, title: '' };
    s.quests.forEach((q) => { q.steps = Array.isArray(q.steps) ? q.steps : []; q.status = q.status || 'active'; });
    return s;
  }
  const qById = (id) => S.quests.find((q) => q.id === id);
  const canSee = (q) => dmOn || !q.hidden;
  function pubOf(s) {
    const o = clone(s);
    o.quests = o.quests.filter((q) => !q.hidden).map((q) => { delete q.note; return q; });
    o.ecos = o.ecos.map((e) => (e.unlocked ? e : { id: e.id, num: e.num, unlocked: false }));
    if (o.tracked && !o.quests.some((q) => q.id === o.tracked)) o.tracked = null;
    return o;
  }

  /* =================================================================== escenari */
  let sc = 1;
  function fit() {
    sc = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * sc) / 2}px,${(innerHeight - 1080 * sc) / 2}px) scale(${sc})`;
  }
  function fatal(msg) { const d = document.createElement('div'); d.className = 'fatal'; d.textContent = msg; document.body.appendChild(d); }
  let toastT;
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; clearTimeout(toastT);
    G.fromTo(t, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3 * D, overwrite: true });
    toastT = setTimeout(() => G.to(t, { opacity: 0, duration: 0.4 * D }), ms || 2600);
  }

  /* =================================================================== llum (gobo) */
  /* Ombra d'arbres en WebGL amb vent (soroll simplex). Quan s'obre un paper o el mapa, aquest "s'aixeca"
     cap a la càmera: surt de l'ombra (forat amb la seva forma, seguit cada fotograma) i el tauler del
     fons queda desenfocat. Si no hi ha GPU, queden les capes CSS amb un balanceig simple. */
  const LIFT = { v: 0, el: null, kind: '' };
  function initGobo() {
    const cv = $('#goboGL'); if (!cv) return;
    let gl = null;
    try { gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) {}
    if (!gl) return;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!FORCE_GL && dbg && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)))) return;
    const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;uniform vec2 uRes;uniform float uT;uniform float uGust;uniform vec2 uSway;uniform vec3 uCol;uniform vec2 uStr;
uniform vec4 uHole;uniform float uHoleR;uniform float uLift;uniform float uRem;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 mm=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);mm=mm*mm;
  return 42.0*dot(mm*mm,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float shade(vec2 w,float b){return texture2D(uTex,vec2((w.x+80.0)/2080.0,(w.y+153.3)/1386.7),b).a;}
void main(){
  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)*(1920.0/uRes.x);
  vec2 q=p/1920.0;
  vec2 big=vec2(snoise(vec3(q*1.7,uT*0.11)),snoise(vec3(q*1.7+19.1,uT*0.11)));
  vec2 sm=vec2(snoise(vec3(q*7.0,uT*0.55)),snoise(vec3(q*7.0+41.3,uT*0.55)));
  vec2 disp=uSway+(big*11.0+sm*2.6*(0.6+uGust))*uGust;
  vec2 hp=p-uHole.xy;float hc=cos(uHoleR),hs=sin(uHoleR);
  vec2 hq=vec2(hc*hp.x+hs*hp.y,-hs*hp.x+hc*hp.y);
  vec2 dd=abs(hq)-uHole.zw;float sd=max(dd.x,dd.y);
  float inside=(1.0-smoothstep(-16.0,-2.0,sd))*uLift;
  float bias=2.6*uLift*(1.0-inside);
  float a1=shade(p+disp,bias);
  float a2=shade(p+disp*1.35+sm*3.5+vec2(9.0,5.0),bias);
  float A=1.0-(1.0-uStr.x*a1)*(1.0-uStr.y*a2);
  A*=1.0-0.18*uLift*(1.0-inside);
  float soft=shade(p*0.92+vec2(70.0,40.0)+disp*1.6,4.5);
  A=mix(A,uRem*soft,inside);
  gl_FragColor=vec4(uCol*A,A);
}`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : (console.warn(gl.getShaderInfoLog(o)), null); };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const la = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ['uTex', 'uRes', 'uT', 'uGust', 'uSway', 'uCol', 'uStr', 'uHole', 'uHoleR', 'uLift', 'uRem'].forEach((n) => { U[n] = gl.getUniformLocation(pr, n); });
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform3f(U.uCol, 16 / 255, 18 / 255, 26 / 255);
    gl.uniform2f(U.uStr, 0.36, 0.12);
    gl.uniform1i(U.uTex, 0);
    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      stage.classList.add('gl'); requestAnimationFrame(frame);
    };
    img.src = 'assets/gobo.webp';
    function hole() {
      const el = LIFT.el;
      if (!el || LIFT.v < 0.001) return [0, 0, 0, 0, 0];
      const x = gp(el, 'x'), y = gp(el, 'y'), r = gp(el, 'rotation') * Math.PI / 180;
      if (LIFT.kind === 'map') {
        const s = gp(el, 'scaleX') || 1, cx = MAP.w / 2 * s, cy = MAP.h / 2 * s;
        return [MAP.x + x + Math.cos(r) * cx - Math.sin(r) * cy, MAP.y + y + Math.sin(r) * cx + Math.cos(r) * cy, cx, cy, r];
      }
      const s = gp(el, 'scaleX') || 1, W = el._g ? el._g.W : 0, H = el._g ? el._g.H : 0;
      return [x + W / 2, y + H / 2, W / 2 * s, H / 2 * s, r];
    }
    const t0 = performance.now();
    let last = 0, drawn = 0, n = 0, slow = 0;
    function frame(now) {
      if (last && !FORCE_GL && ++n > 20) {
        slow = now - last > 50 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 25) { stage.classList.remove('gl'); return; }
      }
      last = now;
      /* el vent és lent: n'hi ha prou amb ~30 fps i deixa la GPU lliure per als papers;
         mentre un paper vola es dibuixa cada fotograma perquè el forat de l'ombra el segueixi */
      const moving = LIFT.el && ((LIFT.v > 0.001 && LIFT.v < 0.999) || (window.gsap && window.gsap.isTweening(LIFT.el)));
      if (!moving && now - drawn < 30) { requestAnimationFrame(frame); return; }
      drawn = now;
      const t = reduce ? 30 : (now - t0) / 1000 + 30;
      const gust = 0.62 + 0.2 * Math.sin(t * 0.29) + 0.12 * Math.sin(t * 0.71 + 1.3) + 0.07 * Math.sin(t * 1.63 + 0.4);
      gl.uniform1f(U.uT, t); gl.uniform1f(U.uGust, gust);
      gl.uniform2f(U.uSway, (7 * Math.sin(t * 0.23) + 3 * Math.sin(t * 0.61 + 2)) * gust, (3.5 * Math.sin(t * 0.19 + 1) + 2 * Math.sin(t * 0.47)) * gust);
      const h = hole();
      gl.uniform4f(U.uHole, h[0], h[1], h[2], h[3]); gl.uniform1f(U.uHoleR, h[4]);
      gl.uniform1f(U.uLift, LIFT.el ? LIFT.v : 0); gl.uniform1f(U.uRem, LIFT.kind === 'map' ? 0 : 0.08);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    }
  }
  /* el paper surt de l'ombra de seguida en aixecar-se i hi torna just quan aterra */
  function liftTo(el, kind, on, landAt) {
    if (on) { LIFT.el = el; LIFT.kind = kind; stage.classList.add('lift'); }
    else stage.classList.remove('lift');
    const o = on ? { v: 1, duration: (kind === 'map' ? 0.3 : 0.42) * D, delay: 0.04 * D, ease: 'power1.out' }
      : { v: 0, duration: 0.26 * D, delay: (landAt || 0.4) * D, ease: 'power1.in' };
    if (window.gsap) window.gsap.to(LIFT, Object.assign({ overwrite: true }, o)); else LIFT.v = on ? 1 : 0;
  }

  /* =================================================================== arrencada */
  async function fontsReady() {
    if (!document.fonts) return;
    const loads = ['60px Antiquarian', '30px "Antiquarian Scribe"', '27px Alegreya', 'italic 27px Alegreya'].map((f) => document.fonts.load(f).catch(() => null));
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 3500))]);
  }
  async function fetchData() {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  function pickState() {
    if (FULL) {
      const w = ls.get(LSK.work);
      if (w && w.state && (w.baseRev || 0) >= (REMOTE.rev || 0)) { WORK = w; return normState(clone(w.state)); }
      if (w && w.dirty) ls.set(LSK.work + '.old', w);
      WORK = { baseRev: REMOTE.rev || 0, dirty: false };
      return normState(clone(FULL));
    }
    return normState(clone(PUB));
  }
  async function start() {
    fit(); addEventListener('resize', fit);
    initGobo();
    if (!window.crypto || !crypto.subtle) { fatal('Aquest navegador no pot obrir el tauler (cal una connexió segura).'); return; }
    try { REMOTE = await fetchData(); } catch (e) { fatal("No s'ha pogut carregar el tauler de missions."); return; }
    const kp = ls.get(LSK.kp);
    if (kp) { KP = await keyIn(kp); if (KP) PUB = await unseal(KP, REMOTE.pub); }
    if (!PUB) {
      KP = null;
      await askGate({
        kicker: 'Diari de Phentanil', title: 'Tauler de missions', text: 'Escriu la contrasenya del grup per entrar.', ph: 'Contrasenya', btn: 'Entrar', back: true,
        check: async (v) => {
          const k = await derive(v, REMOTE.kdf.sp, REMOTE.kdf.iter), p = await unseal(k, REMOTE.pub);
          if (!p) return 'Contrasenya incorrecta';
          KP = k; PUB = p; ls.set(LSK.kp, await keyOut(k)); return null;
        }
      });
    }
    const kd = ss.get(LSK.kd);
    if (kd) { KD = await keyIn(kd); FULL = KD ? await unseal(KD, REMOTE.dm) : null; if (!FULL) { KD = null; ss.del(LSK.kd); } }
    S = pickState();
    await fontsReady();
    initTV();
  }

  /* =================================================================== porta (contrasenyes i clau) */
  function askGate(o) {
    return new Promise((resolve) => {
      const g = $('#gate');
      g.innerHTML = `<form class="gate-p${o.wide ? ' wide' : ''}" autocomplete="off" novalidate>
        <div class="gate-k">${esc(o.kicker)}</div><h1 class="gate-t">${esc(o.title)}</h1>${o.text ? `<p class="gate-s">${o.text}</p>` : ''}
        <div class="gate-f"><input type="${o.type || 'password'}" placeholder="${esc(o.ph || '')}" spellcheck="false" autocapitalize="off" autocomplete="off"><button class="btn pri" type="submit">${esc(o.btn || 'Entrar')}</button></div>
        <div class="gate-e"></div>${o.cancel ? `<button type="button" class="gate-x" data-x>${esc(o.cancel)}</button>` : ''}${o.back ? '<a class="gate-x" href="../">← Tornar al wiki</a>' : ''}</form>`;
      g.hidden = false;
      const f = g.firstElementChild, inp = f.querySelector('input'), err = f.querySelector('.gate-e');
      G.fromTo(f, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45 * D, ease: 'power3.out' });
      setTimeout(() => inp.focus(), 60);
      let busy = false;
      const close = (v) => G.to(f, { opacity: 0, y: -20, duration: 0.3 * D, onComplete: () => { g.hidden = true; g.innerHTML = ''; resolve(v); } });
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); if (busy) return;
        const val = inp.value; if (!val.trim()) return;
        busy = true; err.textContent = 'Comprovant…';
        let msg = null; try { msg = await o.check(val); } catch (ex) { msg = 'No ha funcionat: ' + ex.message; }
        busy = false;
        if (msg) { err.textContent = msg; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); inp.select(); }
        else close(val);
      });
      const x = f.querySelector('[data-x]'); if (x) x.addEventListener('click', () => close(null));
      f.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && o.cancel) close(null); });
    });
  }

  /* =================================================================== tauler */
  function clampC(cx, cy, w, h, r) {
    const a = Math.abs(r) * Math.PI / 180, bw = w * Math.cos(a) + h * Math.sin(a), bh = w * Math.sin(a) + h * Math.cos(a), m = 10;
    return [Math.max(bw / 2 + m, Math.min(1920 - bw / 2 - m, cx)), Math.max(bh / 2 + m, Math.min(1080 - bh / 2 - m, cy))];
  }
  /* mida completa del document segons la proporció del lloc: al tauler es veu a escala s */
  function geomOf(id, sl) {
    const r = sl.r + ((hashOf(id, 131) % 9) - 4) * 0.15;
    const [cx, cy] = clampC(sl.cx, sl.cy, sl.w, sl.h, r);
    const ar = sl.w / sl.h;
    let H = 960, W = H * ar; if (W > 1240) { W = 1240; H = W / ar; }
    W = Math.round(W); H = Math.round(H);
    return { cx, cy, w: sl.w, h: sl.h, x: cx - sl.w / 2, y: cy - sl.h / 2, W, H, s: sl.w / W, r, z: sl.z };
  }
  const pileGeom = (id) => geomOf(id, { cx: PILE.x + PILE.w / 2, cy: PILE.y + PILE.h / 2, w: PILE.w, h: PILE.h, r: PILE.r, z: 30 });
  function layout() {
    const vis = S.quests.filter(canSee);
    const act = vis.filter((q) => !isDone(q));
    const done = vis.filter(isDone).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const prin = act.filter((q) => catOf(q) === 'principal').sort((p, q) => (q.id === S.tracked) - (p.id === S.tracked));
    const quests = prin.concat(act.filter((q) => catOf(q) === 'personal'), act.filter((q) => catOf(q) === 'secundaria'));
    const free = REF.slice(); if (!done.length) free.push(SLOT_B2);
    const over = OVER.slice(), slots = {};
    quests.forEach((q, n) => {
      let sl = null;
      for (const sid of SLOT_PREF[catOf(q)]) { const k = free.findIndex((f) => f.id === sid); if (k >= 0) { sl = free.splice(k, 1)[0]; break; } }
      if (!sl && free.length) sl = free.shift();
      if (!sl) sl = over.shift() || { cx: 1200 + (hashOf(q.id, 7) % 680), cy: 120 + (hashOf(q.id, 131) % 860), w: 170, h: 210, r: (hashOf(q.id, 3) % 13) - 6, z: 50 + n };
      slots[q.id] = geomOf(q.id, sl);
    });
    const ids = quests.map((q) => q.id);
    return { slots, ids, done, order: ids.concat(done.map((q) => q.id)) };
  }
  function texFor(q, g) {
    const ar = g.W / g.H;
    if (ar < 0.6) return '7';
    const list = TEX[catOf(q)], t = list[hashOf(q.id, 17) % list.length];
    return ar > 1.12 ? t + 'r' : t;
  }

  /* contingut del document (igual al tauler i ampliat) */
  function docHTML(q, edit) {
    const c = catOf(q), steps = q.steps || [], nd = steps.filter((s) => s.d).length, cur = isDone(q) ? -1 : steps.findIndex((s) => !s.d);
    const h = [];
    if (c === 'personal') h.push(`<div class="d-to">Per a ${esc(q.who || '…')}</div>`);
    else if (c === 'principal') h.push('<div class="d-k"><i class="st"></i><span>Missió principal</span><i class="st"></i></div>');
    else h.push(`<div class="d-k"><span>${q.reward ? 'Recompensa' : ['Avís', 'Es busca', 'Atenció'][hashOf(q.id, 53) % 3]}</span></div>`);
    h.push(`<h2 class="d-t" data-f="title" data-ph="Títol">${esc(q.title)}</h2>`);
    const meta = [];
    if (q.where) meta.push(`<span><b>Lloc</b>${esc(q.where)}</span>`);
    if (c !== 'secundaria' && q.giver) meta.push(`<span>${esc(giverLine(q.giver))}</span>`);
    if (meta.length) h.push(`<div class="d-m">${meta.join('')}</div>`);
    h.push('<div class="d-rule"></div>');
    if (c === 'secundaria' && (q.reward || edit)) h.push(`<div class="d-r"><b data-f="reward" data-ph="Recompensa (opcional)">${esc(q.reward || '')}</b></div>`);
    if (q.text || edit) h.push(`<div class="d-x" data-f="text" data-ph="Text del cartell…">${esc(q.text || '')}</div>`);
    if (q.special === 'ecos') {
      h.push(`<ul class="d-e">${S.ecos.map((e) => `<li class="${e.unlocked ? '' : 'lock'}" data-eco="${esc(e.id)}"><b>${e.id === 'final' ? 'Final' : 'Eco ' + esc(e.num)}</b><span>${e.unlocked || (edit && e.title) ? `<strong>${esc(e.title)}.</strong> ${esc(e.text || '')}${e.unlocked ? '' : ' <em>(bloquejat)</em>'}` : 'No recuperat'}</span></li>`).join('')}</ul>`);
    }
    if (steps.length || edit) {
      h.push(`<div class="d-o"><h3><span>Objectius</span><i></i><b>${nd}/${steps.length}</b></h3><ul>${steps.map((s, i) => `<li class="${s.d ? 'd' : ''}${i === cur ? ' cur' : ''}" data-i="${i}"><span class="bx"></span><span class="tx" data-f="step" data-ph="Objectiu">${esc(s.t)}</span><button type="button" class="del" data-act="delstep" tabindex="-1" title="Treure">×</button></li>`).join('')}</ul>${edit ? '<button type="button" class="add" data-act="addstep">+ Afegir objectiu</button>' : ''}</div>`);
    }
    if (c === 'secundaria' && q.giver) h.push(`<div class="d-f">${esc(giverLine(q.giver))}</div>`);
    return h.join('');
  }
  /* cap el contingut si l'últim bloc acaba dins del paper (scrollHeight no serveix: les lletres de
     l'Antiquarian sobresurten de la línia i sempre marcarien uns píxels de més) */
  function fitDoc(el) {
    const inn = el.firstElementChild;
    const fits = () => { const c = inn.lastElementChild; return !c || c.offsetTop + c.offsetHeight <= inn.clientHeight + 1; };
    inn.style.setProperty('--k', 1);
    if (fits()) return;
    let lo = 0.4, hi = 1;
    for (let i = 0; i < 7; i++) { const k = (lo + hi) / 2; inn.style.setProperty('--k', k); if (fits()) lo = k; else hi = k; }
    inn.style.setProperty('--k', lo);
  }
  function makeDoc(q) {
    const el = document.createElement('div');
    el.className = 'doc'; el.dataset.id = q.id;
    el.innerHTML = '<div class="doc-in"></div><div class="d-stamp">Completada</div><div class="d-hid">Oculta</div>';
    $('#docs').appendChild(el);
    return el;
  }
  /* aplica el contingut i la mida; si la mida canvia, manté el centre on era */
  function applyDoc(el, q, g, force) {
    const tex = texFor(q, g), P = PAPER[tex], edit = el.classList.contains('editing');
    el.className = `doc c-${catOf(q)}${isDone(q) ? ' done' : ''}${q.hidden ? ' hid' : ''}${edit ? ' editing' : ''}${el.classList.contains('zoomed') ? ' zoomed' : ''}${T.focus === q.id ? ' focus' : ''}`;
    const old = el._g;
    if (old && (old.W !== g.W || old.H !== g.H)) G.set(el, { x: gp(el, 'x') + (old.W - g.W) / 2, y: gp(el, 'y') + (old.H - g.H) / 2 });
    el._g = g;
    const sig = JSON.stringify([q.title, q.cat, q.who, q.giver, q.where, q.reward, q.text, q.steps, q.special ? S.ecos : 0, g.W, g.H, tex, edit, isDone(q)]);
    if (force || el._sig !== sig) {
      el._sig = sig;
      el.style.width = g.W + 'px'; el.style.height = g.H + 'px';
      el.style.setProperty('--tex', `url(assets/paper-${tex}.webp)`);
      ['it', 'ir', 'ib', 'il'].forEach((k, i) => el.style.setProperty('--' + k, P.i[i]));
      el.firstElementChild.innerHTML = docHTML(q, edit);
      if (edit) setEditable(el, true);
      fitDoc(el);
    }
    if (!el.classList.contains('zoomed')) el.style.setProperty('--is', (1 / g.s).toFixed(3));
  }
  const homeOf = (g) => ({ x: g.cx - g.W / 2, y: g.cy - g.H / 2 });
  function renderBoard(anim) {
    L = layout();
    const seen = new Set();
    L.ids.forEach((id, n) => {
      const q = qById(id), g = L.slots[id];
      let el = docs.get(id), isNew = false;
      if (!el) { el = makeDoc(q); docs.set(id, el); isNew = true; }
      if (el._temp) el._temp = false;
      seen.add(id);
      applyDoc(el, q, g);
      if (T.zoom === id) return;
      el.style.zIndex = T.focus === id ? 90 : g.z;
      const h = homeOf(g), sx = T.zoom ? scatterX(g) : 0, foc = T.focus === id && !T.zoom;
      const tgt = { x: h.x + sx, y: h.y, scale: g.s * (foc ? FOC : 1), rotation: foc ? g.r * FOCR : g.r + (T.zoom ? (g.cx < 960 ? -7 : 7) : 0) };
      if (isNew || !anim) {
        G.set(el, Object.assign({}, tgt, { opacity: 1 }));
        if (isNew && anim) G.fromTo(el, { opacity: 0, y: h.y - 40 }, { opacity: 1, y: h.y, duration: 0.5 * D, ease: 'power2.out', delay: n * 0.02 * D });
      } else G.to(el, Object.assign({ duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto' }, tgt));
    });
    docs.forEach((el, id) => {
      if (seen.has(id) || T.zoom === id) return;
      docs.delete(id);
      const q = qById(id);
      if (q && isDone(q) && canSee(q)) toPile(el); else G.to(el, { opacity: 0, y: gp(el, 'y') + 30, duration: 0.35 * D, onComplete: () => el.remove() });
    });
    renderPile(); renderParty();
    if (T.focus && !itemOf(T.focus)) T.focus = null;
  }
  function toPile(el) {
    const g = pileGeom(el.dataset.id), h = homeOf(g);
    el.style.zIndex = 31;
    G.to(el, { x: h.x, y: h.y, scale: g.s, rotation: g.r + 3, duration: 0.55 * D, ease: 'power3.inOut', onComplete: () => G.to(el, { opacity: 0, duration: 0.25 * D, onComplete: () => el.remove() }) });
  }
  function renderPile() {
    const pile = $('#pile');
    pile.hidden = !L.done.length;
    $('#pileN').textContent = L.done.length;
  }
  function renderParty() {
    const p = S.party || {};
    $('#ptag').innerHTML = `<span class="l">Nivell</span><b>${esc(p.level == null ? '' : p.level)}</b><span class="t">${esc(p.title || '')}</span>`;
  }
  function itemList() {
    const list = [Object.assign({ key: 'map', el: $('#bmap') }, MAP)];
    if (L.done.length) list.push(Object.assign({ key: 'pile', el: $('#pile') }, PILE));
    L.ids.forEach((id) => { const el = docs.get(id); if (el) list.push(Object.assign({ key: id, el }, L.slots[id])); });
    return list;
  }
  const itemOf = (key) => itemList().find((it) => it.key === key);

  /* =================================================================== focus i navegació */
  function lift(key, on) {
    const it = itemOf(key); if (!it) return;
    it.el.classList.toggle('focus', on);
    if (key !== 'map' && key !== 'pile') it.el.style.zIndex = on ? 90 : it.z;
    if (T.zoom) return;
    if (key === 'map') G.to(it.el, { scale: on ? FOCM : 1, duration: 0.32 * D, ease: 'power2.out', overwrite: 'auto' });
    else if (key === 'pile') G.to(it.el, { scale: on ? FOC : 1, rotation: on ? PILE.r * FOCR : PILE.r, duration: 0.32 * D, ease: 'power2.out', overwrite: 'auto' });
    else G.to(it.el, { scale: it.s * (on ? FOC : 1), rotation: on ? it.r * FOCR : it.r, duration: 0.32 * D, ease: 'power2.out', overwrite: 'auto' });
  }
  function setFocus(key) {
    if (!key || key === T.focus) return;
    if (T.focus) lift(T.focus, false);
    T.focus = key; lift(key, true);
  }
  function navDir(dx, dy) {
    const list = itemList();
    if (!T.focus) { setFocus((list.find((i) => i.key === S.tracked) || list[1] || list[0]).key); return; }
    const cur = list.find((i) => i.key === T.focus); if (!cur) return;
    const cy0 = (it) => it.y + Math.min(it.h, 180) / 2, cx = cur.x + cur.w / 2, cy = cy0(cur);
    let best = null, bs = Infinity;
    list.forEach((it) => {
      if (it.key === cur.key) return;
      const vx = it.x + it.w / 2 - cx, vy = cy0(it) - cy, along = vx * dx + vy * dy; if (along <= 12) return;
      const s2 = along + Math.abs(vx * dy - vy * dx) * 2.2; if (s2 < bs) { bs = s2; best = it; }
    });
    if (best) setFocus(best.key);
  }
  function scatterX(it) { const cx = it.x + it.w / 2; return cx < 960 ? -(cx + it.w / 2 + 160) : (1920 - cx + it.w / 2 + 160); }
  function scatter(out, except) {
    itemList().forEach((it) => {
      if (it.key === except) return;
      const d = Math.abs(it.x + it.w / 2 - 960) / 960, isDoc = it.key !== 'map' && it.key !== 'pile';
      const h = isDoc ? homeOf(it) : { x: 0, y: 0 }, s = isDoc ? it.s : 1, foc = it.key === T.focus;
      if (out) G.to(it.el, { x: h.x + scatterX(it), y: h.y, rotation: it.r + (it.x + it.w / 2 < 960 ? -7 : 7), scale: s, duration: 0.55 * D, ease: 'power3.in', delay: (1 - d) * 0.12 * D, overwrite: 'auto' });
      else G.to(it.el, { x: h.x, y: h.y, rotation: foc && it.key !== 'map' ? it.r * FOCR : it.r, scale: foc ? s * (it.key === 'map' ? FOCM : FOC) : s, duration: 0.6 * D, ease: 'power3.out', delay: d * 0.12 * D, overwrite: 'auto' });
    });
    G.to('#dim', { opacity: out ? 1 : 0, duration: 0.5 * D });
    G.to('#zp', { opacity: out ? 1 : 0, duration: 0.4 * D, delay: out ? 0.5 * D : 0 });
  }

  /* =================================================================== paper ampliat */
  function zoomTarget(g) {
    const TX = dmOn ? 690 : 960, TY = 532, z = Math.min(1, 990 / g.H, (dmOn ? 1150 : 1760) / g.W);
    return { x: TX - g.W / 2, y: TY - g.H / 2, scale: z, rotation: 0 };
  }
  /* el document d'una missió feta surt de la pila i hi torna */
  function docForZoom(id) {
    let el = docs.get(id);
    if (el) return el;
    const q = qById(id); if (!q) return null;
    el = makeDoc(q); el._temp = true; docs.set(id, el);
    const g = pileGeom(id), h = homeOf(g);
    applyDoc(el, q, g);
    el.style.zIndex = 31;
    G.set(el, { x: h.x, y: h.y, scale: g.s, rotation: g.r + 3, opacity: 1 });
    return el;
  }
  function flyIn(el) {
    el.classList.add('zoomed'); el.style.zIndex = 110;
    el.style.setProperty('--is', 2.4);
    G.to(el, Object.assign({ duration: 0.7 * D, ease: 'power3.inOut', overwrite: 'auto' }, zoomTarget(el._g)));
    liftTo(el, 'doc', true);
  }
  function openDoc(id) {
    if (T.zoom === 'map') return closeMap().then(() => openDoc(id));
    if (T.zoom && T.zoom !== id) return swapDoc(id, 1);
    if (T.zoom === id) return Promise.resolve();
    const el = docForZoom(id); if (!el) return Promise.resolve();
    if (T.focus) lift(T.focus, false);
    T.zoom = id; T.zEl = el; if (L.slots[id]) T.focus = id;
    scatter(true, id);
    flyIn(el);
    if (dmOn) enterEdit(el);
    renderPrompts();
    return wait(700);
  }
  function settleOut(el, dir) {
    const id = el.dataset.id, g = L.slots[id];
    el.classList.remove('zoomed'); setEditing(el, false);
    if (g && !el._temp) {
      el.style.setProperty('--is', (1 / g.s).toFixed(3));
      const h = homeOf(g);
      G.to(el, { x: h.x + scatterX(g), y: h.y, scale: g.s, rotation: g.r + (g.cx < 960 ? -7 : 7), duration: 0.5 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { el.style.zIndex = g.z; } });
    } else {
      if (docs.get(id) === el) docs.delete(id);
      if (qById(id) && isDone(qById(id))) {
        const pg = pileGeom(id), h = homeOf(pg);
        G.to(el, { x: h.x, y: h.y, scale: pg.s, rotation: pg.r + 3, duration: 0.5 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => el.remove() });
      } else G.to(el, { x: gp(el, 'x') - dir * 1400, opacity: 0, duration: 0.45 * D, onComplete: () => el.remove() });
    }
  }
  function swapDoc(id, dir) {
    const prev = T.zEl, next = docForZoom(id); if (!next || next === prev) return Promise.resolve();
    if (prev) { liftTo(prev, 'doc', false, 0); settleOut(prev, dir); }
    T.zoom = id; T.zEl = next; if (L.slots[id]) T.focus = id;
    flyIn(next);
    if (dmOn) enterEdit(next);
    renderPrompts();
    return wait(700);
  }
  function closeDoc() {
    const id = T.zoom, el = T.zEl; if (!id || id === 'map' || !el) return Promise.resolve();
    T.zoom = null; T.zEl = null;
    setEditing(el, false); hideDmCard();
    el.classList.remove('zoomed');
    const q = qById(id), g = q && canSee(q) && !isDone(q) ? L.slots[id] : null;
    liftTo(el, 'doc', false, 0.42);
    if (g && !el._temp) {
      el.style.setProperty('--is', (1 / g.s).toFixed(3));
      const h = homeOf(g);
      G.to(el, { x: h.x, y: h.y, scale: g.s * FOC, rotation: g.r * FOCR, duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { el.style.zIndex = T.focus === id ? 90 : g.z; } });
    } else {
      if (docs.get(id) === el) docs.delete(id);
      if (q && isDone(q) && canSee(q)) {
        const pg = pileGeom(id), h = homeOf(pg);
        G.to(el, { x: h.x, y: h.y, scale: pg.s, rotation: pg.r + 3, duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => G.to(el, { opacity: 0, duration: 0.2 * D, onComplete: () => el.remove() }) });
        if (L.done.length) T.focus = 'pile';
      } else G.to(el, { opacity: 0, scale: gp(el, 'scaleX') * 0.9, duration: 0.4 * D, onComplete: () => el.remove() });
    }
    scatter(false, id);
    renderPrompts();
    return wait(650);
  }
  function stepZoom(dir) {
    if (!T.zoom || T.zoom === 'map') return;
    const o = L.order, i = o.indexOf(T.zoom);
    const n = i < 0 ? o[0] : o[(i + dir + o.length) % o.length];
    if (n && n !== T.zoom) swapDoc(n, dir);
  }
  function openKey(key) {
    if (key === 'map') return openMap();
    if (key === 'pile') { const d = L.done[0]; return d ? openDoc(d.id) : Promise.resolve(); }
    return openDoc(key);
  }
  const closeAny = () => (T.zoom === 'map' ? closeMap() : closeDoc());

  /* =================================================================== mapa */
  function renderLabels() {
    let h = '';
    GEOM.forEach((p) => {
      if (p.icon) {
        const [cx, cy, r] = p.icon, u = r / 62;
        h += `<g class="plc" data-p="${p.id}"><circle class="hit" cx="${cx}" cy="${cy}" r="${r + 26}"/><circle class="ic" cx="${cx}" cy="${cy}" r="${r + 8}"/><circle class="icr" cx="${cx}" cy="${cy}" r="${r - 4}"/>` +
          `<circle class="icd" cx="${cx}" cy="${cy - 26 * u}" r="${9 * u}"/><path class="icd" d="M${cx - 15 * u} ${cy - 10 * u}h${22 * u}v${36 * u}h${8 * u}v${8 * u}h${-32 * u}v${-8 * u}h${8 * u}v${-28 * u}h${-6 * u}z"/></g>`;
        return;
      }
      const [x1, y1, x2, y2] = p.ar, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const hl = 40, hw = 17, bx = x2 - ux * hl, by = y2 - uy * hl, sx = x2 - ux * (hl - 4), sy = y2 - uy * (hl - 4);
      const head = `${x2},${y2} ${(bx + px * hw).toFixed(1)},${(by + py * hw).toFixed(1)} ${(bx - px * hw).toFixed(1)},${(by - py * hw).toFixed(1)}`;
      const tx0 = Math.min(...p.ln.map((l) => l[1])), tx1 = Math.max(...p.ln.map((l) => l[1] + l[3])), ty0 = Math.min(...p.ln.map((l) => l[2])) - 50, ty1 = Math.max(...p.ln.map((l) => l[2])) + 16;
      h += `<g class="plc" data-p="${p.id}"><line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><rect class="hit" x="${tx0 - 18}" y="${ty0 - 14}" width="${tx1 - tx0 + 36}" height="${ty1 - ty0 + 28}"/>` +
        `<line class="h" x1="${x1}" y1="${y1}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}"/><polygon class="hh" points="${head}"/><line class="s" x1="${x1}" y1="${y1}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}"/><polygon class="sh" points="${head}"/>` +
        p.ln.map((l) => `<text x="${l[1]}" y="${l[2]}" textLength="${l[3]}" lengthAdjust="spacing">${esc(l[0])}</text>`).join('') + '</g>';
    });
    $('#labels').innerHTML = h;
  }
  const plcEl = (id) => $(`.plc[data-p="${id}"]`);
  const questsAt = (id) => S.quests.filter((q) => canSee(q) && !isDone(q) && q.place === id);
  function setPlace(id) {
    if (T.place === id) return;
    if (T.place) { const o = plcEl(T.place); if (o) o.classList.remove('on'); }
    T.place = id;
    if (id) { const e = plcEl(id); if (e) e.classList.add('on'); }
    renderPrompts();
  }
  function placeNav(dx, dy) {
    const pts = GEOM.map((p) => {
      const xs = p.icon ? [p.icon[0]] : p.ln.map((l) => l[1] + l[3] / 2), ys = p.icon ? [p.icon[1]] : p.ln.map((l) => l[2]);
      return { id: p.id, x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length };
    });
    if (!T.place) { setPlace('ajuntament'); return; }
    const cur = pts.find((p) => p.id === T.place); if (!cur) return;
    let best = null, bs = Infinity;
    pts.forEach((p) => {
      if (p.id === cur.id) return;
      const vx = p.x - cur.x, vy = p.y - cur.y, along = vx * dx + vy * dy; if (along <= 30) return;
      const s2 = along + Math.abs(vx * dy - vy * dx) * 2.2; if (s2 < bs) { bs = s2; best = p; }
    });
    if (!best) return;
    setPlace(best.id);
    if (T.card) { if (best.id === 'tauler') closeCard(); else openCard(best.id); }
  }
  function placeText(id) { const o = S.places[id]; return o && typeof o.text === 'string' ? o.text : (PLACE_INFO[id] || {}).text || ''; }
  function placeBox(id) {
    const p = PL[id], s = MAPZ, ox = (1920 - MAP.w * s) / 2, oy = (1080 - MAP.h * s) / 2, k = MAP.w * s / 4950;
    if (p.icon) return { l: ox + (p.icon[0] - p.icon[2]) * k, r: ox + (p.icon[0] + p.icon[2]) * k, cy: oy + p.icon[1] * k };
    const xs = p.ln.map((l) => l[1]).concat(p.ln.map((l) => l[1] + l[3]), [p.ar[0], p.ar[2]]), ys = p.ln.map((l) => l[2] - 25);
    return { l: ox + Math.min(...xs) * k, r: ox + Math.max(...xs) * k, cy: oy + (ys.reduce((a, b) => a + b, 0) / ys.length) * k };
  }
  function openCard(id) {
    const p = PL[id]; if (!p) return;
    const c = $('#pcard'), qs = questsAt(id), info = PLACE_INFO[id] || {}, txt = placeText(id);
    if (T.card) { const o = plcEl(T.card); if (o) o.classList.remove('sel'); }
    T.card = id; const e = plcEl(id); if (e) e.classList.add('sel');
    c.innerHTML = `<div class="pc-k">Lloc</div><div class="pc-t">${esc(p.name)}</div><div class="pc-x"${dmOn ? ' contenteditable="plaintext-only" spellcheck="false"' : ''} data-place="${esc(id)}">${esc(txt)}</div>` +
      (qs.length ? `<div class="pc-q">${qs.map((q) => `<button type="button" data-q="${esc(q.id)}" style="--c:var(--${catOf(q) === 'principal' ? 'red' : catOf(q) === 'personal' ? 'indigo' : 'green'})"><i></i><span>${esc(q.title)}${q.hidden ? ' · oculta' : ''}</span></button>`).join('')}</div>` : '<div class="pc-none">Res de nou per aquí</div>') +
      (info.href ? `<a class="pc-w" href="../${info.href}" target="_blank" rel="noopener">Més a la wiki →</a>` : '');
    c.classList.add('on');
    const b = placeBox(id), w = 400, h = c.offsetHeight;
    let x = b.r + 14; if (x + w > 1900) x = b.l - 14 - w; x = Math.max(20, Math.min(1900 - w, x));
    const y = Math.max(24, Math.min(1080 - h - 70, b.cy - h / 2)), rot = (hashOf(id, 7) % 5) - 2;
    G.fromTo(c, { left: x, top: y, opacity: 0, y: 12, rotation: rot - 2, scale: 0.96 }, { left: x, top: y, opacity: 1, y: 0, rotation: rot, scale: 1, duration: 0.3 * D, ease: 'power3.out', overwrite: 'auto' });
    renderPrompts();
  }
  function closeCard() {
    if (!T.card) return;
    const o = plcEl(T.card); if (o) o.classList.remove('sel');
    T.card = null; const c = $('#pcard'); c.classList.remove('on');
    G.to(c, { opacity: 0, y: 10, duration: 0.2 * D, overwrite: 'auto' });
    renderPrompts();
  }
  function openMap() {
    if (T.zoom === 'map') return Promise.resolve();
    if (T.zoom) return closeDoc().then(() => openMap());
    if (T.focus) lift(T.focus, false);
    T.zoom = 'map'; T.focus = 'map';
    const m = $('#bmap');
    m.classList.add('zoomed'); m.style.zIndex = 107;
    scatter(true, 'map');
    G.to(m, { x: (1920 - MAP.w * MAPZ) / 2 - MAP.x, y: (1080 - MAP.h * MAPZ) / 2 - MAP.y, scale: MAPZ, rotation: 0, duration: 0.7 * D, ease: 'power3.inOut', overwrite: 'auto' });
    liftTo(m, 'map', true);
    renderPrompts();
    return wait(700);
  }
  function closeMap() {
    if (T.zoom !== 'map') return Promise.resolve();
    closeCard(); setPlace(null);
    T.zoom = null;
    const m = $('#bmap'); m.classList.remove('zoomed');
    G.to(m, { x: 0, y: 0, scale: FOCM, rotation: MAP.r, duration: 0.6 * D, ease: 'power3.inOut', overwrite: 'auto', onComplete: () => { m.style.zIndex = ''; lift('map', true); } });
    liftTo(m, 'map', false, 0.38);
    scatter(false, 'map'); renderPrompts();
    return wait(600);
  }

  /* =================================================================== indicacions */
  function renderPrompts() {
    const pad = input === 'pad', k = (t, r) => `<i class="key${r ? ' round' : ''}">${t}</i>`;
    let z = [];
    if (T.zoom === 'map') {
      z = [`<span>${pad ? k('◀') + k('▶') : k('←') + k('→')}Llocs</span>`];
      if (!(T.card && !questsAt(T.card).length)) z.push(`<span>${pad ? k('A', 1) : k('↵')}${T.card ? 'Obrir la missió' : 'Veure el lloc'}</span>`);
      z.push(`<span>${pad ? k('B', 1) : k('Esc')}${T.card ? 'Tancar' : 'Tornar al tauler'}</span>`);
    } else if (T.zoom) z = [`<span>${pad ? k('◀') + k('▶') : k('←') + k('→')}Un altre paper</span>`, `<span>${pad ? k('B', 1) : k('Esc')}Tornar al tauler</span>`, `<span>${pad ? k('Y', 1) : k('M')}Mapa</span>`];
    $('#zp').innerHTML = z.join('');
    const zp = $('#zp'); zp.style.left = T.zoom && T.zoom !== 'map' && dmOn ? '-540px' : '0';
  }

  /* =================================================================== mode DM */
  let saveT = null;
  function markDirty() {
    if (!FULL) return;
    WORK = Object.assign({}, WORK, { dirty: true, state: S, t: Date.now() });
    clearTimeout(saveT); saveT = setTimeout(() => ls.set(LSK.work, WORK), 250);
    if (statOverride !== 'Publicant…') statOverride = '';
    updateStat();
  }
  function updateStat() {
    const bar = $('#dmbar'); if (!dmOn || !bar.firstChild) return;
    const st = statText(), s = $('.stat', bar), pb = $('[data-dm="publish"]', bar);
    if (s) { s.textContent = st; s.title = st; s.classList.toggle('dirty', !!(WORK && WORK.dirty)); }
    if (pb) pb.disabled = !(WORK && WORK.dirty) && !armedForce;
  }
  async function unlockDm() {
    if (FULL) return true;
    const ok = await askGate({
      kicker: 'Mode DM', title: 'Només per al DM', text: 'Escriu la contrasenya del DM per veure les missions ocultes i editar el tauler.', ph: 'Contrasenya del DM', btn: 'Entrar', cancel: 'Cancel·lar',
      check: async (v) => {
        const k = await derive(v, REMOTE.kdf.sd, REMOTE.kdf.iter), full = await unseal(k, REMOTE.dm);
        if (!full) return 'Contrasenya incorrecta';
        KD = k; FULL = full; ss.set(LSK.kd, await keyOut(k)); return null;
      }
    });
    if (!ok) return false;
    S = pickState();
    return true;
  }
  async function setDm(on) {
    if (on && !(await unlockDm())) return;
    if (dmOn === on) return;
    if (!on && T.zoom && T.zoom !== 'map') { const q = qById(T.zoom); if (q && q.hidden) await closeDoc(); }
    dmOn = on;
    stage.classList.toggle('dm', on);
    $('#dmBtn').textContent = on ? 'Sortir del mode DM' : 'Mode DM';
    $('#dmbar').hidden = !on;
    $('#chrome').classList.toggle('show', !on);
    if (on) { renderDmBar(); G.fromTo('#dmbar', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.35 * D }); }
    renderBoard(true);
    if (T.zoom && T.zoom !== 'map' && T.zEl) {
      if (on) enterEdit(T.zEl); else { setEditing(T.zEl, false); hideDmCard(); }
      G.to(T.zEl, Object.assign({ duration: 0.5 * D, ease: 'power3.inOut' }, zoomTarget(T.zEl._g)));
    }
    if (T.card) openCard(T.card);
    renderPrompts();
    if (!on && WORK && WORK.dirty && ls.get(LSK.tok)) publish(false, true);
    else if (!on && WORK && WORK.dirty) toast('Tens canvis sense publicar al wiki (es queden guardats en aquest ordinador).', 4200);
  }
  function renderDmBar() {
    if (!dmOn) return;
    const p = S.party || {}, st = statText();
    $('#dmbar').innerHTML = `<span class="k">Mode DM</span><span class="sep"></span>
      <button class="btn" type="button" data-dm="new">+ Nova missió</button>
      <span class="party">Nivell <input type="number" min="1" max="20" data-party="level" value="${esc(p.level || 1)}"><input class="t" data-party="title" value="${esc(p.title || '')}" placeholder="Títol del grup"></span>
      <span class="sep"></span><span class="stat${WORK && WORK.dirty ? ' dirty' : ''}" title="${esc(st)}">${esc(st)}</span>
      <button class="btn pri" type="button" data-dm="publish"${WORK && WORK.dirty ? '' : ' disabled'}>Publicar al wiki</button>
      <button class="btn" type="button" data-dm="export">Exportar</button><button class="btn" type="button" data-dm="import">Importar</button><button class="btn" type="button" data-dm="token">Clau</button>
      <button class="btn" type="button" data-dm="exit">Sortir</button>`;
  }
  let statOverride = '';
  function statText() {
    if (statOverride) return statOverride;
    if (WORK && WORK.dirty) return 'Canvis sense publicar';
    return 'Tot publicat';
  }
  function setStat(s) { statOverride = s; updateStat(); }

  /* fitxa del DM al costat del paper ampliat */
  function enterEdit(el) { setEditing(el, true); renderDmCard(); }
  function setEditing(el, on) {
    if (!el) return;
    const was = el.classList.contains('editing');
    if (was === on) return;
    el.classList.toggle('editing', on);
    const q = qById(el.dataset.id); if (q) applyDoc(el, q, el._g, true);
    if (!on) setEditable(el, false);
  }
  function setEditable(el, on) {
    $$('[data-f]', el).forEach((f) => {
      if (on) { f.setAttribute('contenteditable', 'plaintext-only'); if (f.contentEditable !== 'plaintext-only') f.setAttribute('contenteditable', 'true'); f.spellcheck = false; }
      else f.removeAttribute('contenteditable');
    });
  }
  function hideDmCard() { const c = $('#dmcard'); c.classList.remove('on'); G.to(c, { opacity: 0, x: 40, duration: 0.25 * D, overwrite: 'auto' }); }
  function renderDmCard() {
    const q = T.zEl && qById(T.zEl.dataset.id), c = $('#dmcard');
    if (!dmOn || !q) { hideDmCard(); return; }
    const c3 = catOf(q), placeOpts = GEOM.filter((p) => p.id !== 'tauler').map((p) => `<option value="${p.id}"${q.place === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    const tags = [isDone(q) ? 'Completada' : 'En curs', q.hidden ? 'Oculta als jugadors' : 'Visible', S.tracked === q.id ? 'Seguida' : ''].filter(Boolean);
    const acts = [];
    if (!isDone(q)) acts.push('<button class="btn pri" type="button" data-q="complete">Completar</button>'); else acts.push('<button class="btn" type="button" data-q="reopen">Reobrir</button>');
    acts.push(q.hidden ? '<button class="btn pri" type="button" data-q="reveal">Revelar</button>' : '<button class="btn" type="button" data-q="hide">Amagar</button>');
    if (!isDone(q) && !q.hidden) acts.push(`<button class="btn${S.tracked === q.id ? ' on' : ''}" type="button" data-q="track">${S.tracked === q.id ? 'Seguida' : 'Seguir'}</button>`);
    c.innerHTML = `<div class="dmc-k">Fitxa del DM</div>
      <div class="dmc-st">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="dmc-acts">${acts.join('')}</div>
      <div class="fl"><span>Tipus</span><div class="seg">${Object.keys(CATS).map((k) => `<button class="btn${c3 === k ? ' on' : ''}" type="button" data-cat="${k}">${k === 'principal' ? 'Principal' : k === 'personal' ? 'Personal' : 'Secundària'}</button>`).join('')}</div></div>
      <div class="two">
        <label class="fl"><span>Per a ${c3 === 'personal' ? '' : '<small>(personals)</small>'}</span><input data-k="who" value="${esc(q.who || '')}"${c3 === 'personal' ? '' : ' disabled'}></label>
        <label class="fl"><span>Encàrrec de</span><input data-k="giver" value="${esc(q.giver || '')}"></label>
      </div>
      <div class="two">
        <label class="fl"><span>Lloc (text)</span><input data-k="where" value="${esc(q.where || '')}"></label>
        <label class="fl"><span>Al mapa</span><select data-k="place"><option value="">Cap lloc</option>${placeOpts}</select></label>
      </div>
      <label class="fl"><span>Recompensa ${c3 === 'secundaria' ? '' : '<small>(cartells secundaris)</small>'}</span><input data-k="reward" value="${esc(q.reward || '')}"></label>
      <label class="fl"><span>Nota del DM (no la veu ningú més)</span><textarea data-k="note" rows="3">${esc(q.note || '')}</textarea></label>
      <p class="dmc-help">El títol, el text i els objectius s'escriuen directament sobre el paper. ${q.special === 'ecos' ? 'Clica un eco per recuperar-lo o bloquejar-lo.' : ''}</p>
      <div class="dmc-acts" style="margin:14px 0 0"><button class="btn warn" type="button" data-q="delete">Eliminar la missió</button></div>`;
    if (!c.classList.contains('on')) { c.classList.add('on'); G.fromTo(c, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 * D, delay: 0.25 * D, ease: 'power3.out', overwrite: 'auto' }); }
  }
  let armedDel = null;
  function questAction(act) {
    const el = T.zEl, q = el && qById(el.dataset.id); if (!q) return;
    if (act === 'complete') {
      q.status = 'done'; q.doneAt = Date.now(); if (S.tracked === q.id) S.tracked = null;
      markDirty(); renderBoard(true); applyDoc(el, q, el._g, true);
      const st = $('.d-stamp', el);
      G.fromTo(st, { opacity: 0, scale: 2.2, rotation: -24 }, { opacity: 0.88, scale: 1, rotation: -11, duration: 0.32 * D, ease: 'back.out(2)', clearProps: 'opacity' });
      G.fromTo('#shell', { x: -10 }, { x: 0, duration: 0.6 * D, ease: 'elastic.out(1,0.3)', delay: 0.24 * D });
    } else if (act === 'reopen') { q.status = 'active'; delete q.doneAt; markDirty(); renderBoard(true); applyDoc(el, q, el._g, true); }
    else if (act === 'reveal') { q.hidden = false; markDirty(); renderBoard(true); }
    else if (act === 'hide') { q.hidden = true; if (S.tracked === q.id) S.tracked = null; markDirty(); renderBoard(true); }
    else if (act === 'track') { S.tracked = S.tracked === q.id ? null : q.id; markDirty(); renderBoard(true); }
    else if (act === 'delete') {
      if (armedDel !== q.id) { armedDel = q.id; toast('Torna a clicar «Eliminar la missió» per esborrar-la del tot.'); return; }
      armedDel = null;
      S.quests = S.quests.filter((x) => x !== q); if (S.tracked === q.id) S.tracked = null;
      markDirty(); closeDoc().then(() => renderBoard(true));
      return;
    }
    if (el._g && L.slots[q.id] && !el._temp) applyDoc(el, q, L.slots[q.id]);
    if (T.zEl === el) G.to(el, Object.assign({ duration: 0.4 * D, ease: 'power2.inOut', overwrite: 'auto' }, zoomTarget(el._g)));
    renderDmCard();
  }
  function newQuest() {
    const id = 'q' + Date.now().toString(36);
    S.quests.push({ id, cat: 'secundaria', title: 'Nova missió', who: '', giver: '', where: '', reward: '', text: '', steps: [], status: 'active', hidden: true, note: '', place: '' });
    markDirty(); renderBoard(true);
    setTimeout(() => openDoc(id).then(() => {
      const t = T.zEl && $('.d-t', T.zEl);
      if (t) { t.focus(); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }), 120);
  }
  /* edició sobre el paper */
  let editT = null;
  function readField(el, f) {
    const q = qById(el.dataset.id); if (!q) return;
    const kind = f.dataset.f, val = f.innerText.replace(/ /g, ' ');
    if (kind === 'title') q.title = val.replace(/\s*\n\s*/g, ' ').trim();
    else if (kind === 'text') q.text = val.replace(/\n{3,}/g, '\n\n').trim();
    else if (kind === 'reward') q.reward = val.replace(/\s*\n\s*/g, ' ').trim();
    else if (kind === 'step') { const i = +f.closest('li').dataset.i; if (q.steps[i]) q.steps[i].t = val.replace(/\s*\n\s*/g, ' ').trim(); }
    el._sig = JSON.stringify([q.title, q.cat, q.who, q.giver, q.where, q.reward, q.text, q.steps, q.special ? S.ecos : 0, el._g.W, el._g.H, texFor(q, el._g), true, isDone(q)]);
    markDirty();
  }
  function refreshEditing(el, focusSel) {
    const q = qById(el.dataset.id); if (!q) return;
    applyDoc(el, q, el._g, true);
    if (focusSel) { const f = $(focusSel, el); if (f) { f.focus(); const r = document.createRange(); r.selectNodeContents(f); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
  }
  function onDocInput(e) {
    const f = e.target.closest('[data-f]'), el = e.target.closest('.doc');
    if (!f || !el || !el.classList.contains('editing')) return;
    clearTimeout(editT); editT = setTimeout(() => readField(el, f), 200);
  }
  function onDocKey(e) {
    const f = e.target.closest('[data-f]'), el = e.target.closest('.doc');
    if (!f || !el || !el.classList.contains('editing')) return;
    const q = qById(el.dataset.id); if (!q) return;
    const kind = f.dataset.f;
    if (e.key === 'Escape') { e.preventDefault(); f.blur(); return; }
    if (e.key === 'Enter' && (kind === 'title' || kind === 'reward')) { e.preventDefault(); f.blur(); return; }
    if (kind === 'step') {
      const i = +f.closest('li').dataset.i;
      if (e.key === 'Enter') { e.preventDefault(); readField(el, f); q.steps.splice(i + 1, 0, { t: '', d: false }); markDirty(); refreshEditing(el, `li[data-i="${i + 1}"] .tx`); }
      else if (e.key === 'Backspace' && !f.innerText.trim()) { e.preventDefault(); q.steps.splice(i, 1); markDirty(); refreshEditing(el, i > 0 ? `li[data-i="${i - 1}"] .tx` : null); }
    }
  }
  function onDocBlur(e) {
    const el = e.target.closest && e.target.closest('.doc');
    if (!el || !el.classList.contains('editing') || !e.target.closest('[data-f]')) return;
    readField(el, e.target.closest('[data-f]'));
    setTimeout(() => {
      if (el.contains(document.activeElement) && document.activeElement.closest('[data-f]')) { fitDoc(el); return; }
      refreshEditing(el); renderDmCard();
    }, 0);
  }
  function onDocClick(e) {
    const el = e.target.closest('.doc');
    if (!el || !el.classList.contains('editing')) return false;
    const q = qById(el.dataset.id); if (!q) return true;
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'addstep') { q.steps.push({ t: '', d: false }); markDirty(); refreshEditing(el, `li[data-i="${q.steps.length - 1}"] .tx`); return true; }
    if (act && act.dataset.act === 'delstep') { q.steps.splice(+act.closest('li').dataset.i, 1); markDirty(); refreshEditing(el); return true; }
    const bx = e.target.closest('.bx');
    if (bx) { const s = q.steps[+bx.closest('li').dataset.i]; if (s) { s.d = !s.d; markDirty(); refreshEditing(el); } return true; }
    const eco = e.target.closest('[data-eco]');
    if (eco) { const ec = S.ecos.find((x) => x.id === eco.dataset.eco); if (ec) { ec.unlocked = !ec.unlocked; markDirty(); refreshEditing(el); } return true; }
    return true;
  }
  function onCardInput(e) {
    const t = e.target, q = T.zEl && qById(T.zEl.dataset.id); if (!q) return;
    const k = t.dataset.k; if (!k) return;
    q[k] = t.value;
    markDirty();
    clearTimeout(editT);
    editT = setTimeout(() => { applyDoc(T.zEl, q, T.zEl._g); }, k === 'note' ? 0 : 160);
  }
  function onCardClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const q = T.zEl && qById(T.zEl.dataset.id); if (!q) return;
    if (b.dataset.cat) { q.cat = b.dataset.cat; markDirty(); renderBoard(true); const g = L.slots[q.id]; if (g && !T.zEl._temp) T.zEl._g = g; applyDoc(T.zEl, q, T.zEl._g, true); G.to(T.zEl, Object.assign({ duration: 0.4 * D }, zoomTarget(T.zEl._g))); renderDmCard(); return; }
    if (b.dataset.q) questAction(b.dataset.q);
  }
  async function onBarClick(e) {
    const b = e.target.closest('[data-dm]'); if (!b) return;
    const a = b.dataset.dm;
    if (a === 'new') newQuest();
    else if (a === 'publish') publish(armedForce);
    else if (a === 'exit') setDm(false);
    else if (a === 'token') askToken(true);
    else if (a === 'export') {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'missions-phentanil-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 2000);
    } else if (a === 'import') $('#impFile').click();
  }
  function onBarInput(e) {
    const t = e.target; if (!t.dataset.party) return;
    S.party = S.party || {};
    if (t.dataset.party === 'level') S.party.level = parseInt(t.value, 10) || 1; else S.party.title = t.value;
    renderParty(); markDirty();
  }

  /* publicar al wiki: data.json xifrat, amb l'API de GitHub */
  let armedForce = false;
  async function askToken(change) {
    const ok = await askGate({
      kicker: 'Mode DM', title: 'Clau de GitHub', wide: true, type: 'password', ph: 'github_pat_… o ghp_…', btn: 'Desar', cancel: 'Cancel·lar',
      text: `${change ? 'Canvia la clau d’accés.' : 'Per publicar els canvis al wiki cal una clau d’accés de GitHub. Només cal fer-ho una vegada en aquest ordinador.'}<br>Crea-la a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained tokens</a>: propietari <b>divas-tragonas</b>, només el repositori <b>wiki</b> i permís <b>Contents: Read and write</b>. També serveix una clau clàssica amb permís <b>repo</b>.`,
      check: async (v) => {
        const tok = v.trim();
        const r = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}`, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' } });
        if (r.status === 401) return 'GitHub no reconeix aquesta clau';
        if (!r.ok) return 'Aquesta clau no pot veure el repositori del wiki';
        const j = await r.json();
        if (j.permissions && !j.permissions.push) return 'Aquesta clau no té permís d’escriptura';
        ls.set(LSK.tok, tok); return null;
      }
    });
    return ok ? ls.get(LSK.tok) : null;
  }
  async function ghPut(tok, content, message, force) {
    const url = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`;
    const hd = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const err = (code, msg) => Object.assign(new Error(msg || code), { code });
    const cur = await fetch(`${url}?ref=${GH.branch}&_=${Date.now()}`, { headers: hd, cache: 'no-store' });
    if (cur.status === 401) throw err('auth');
    let sha;
    if (cur.ok) {
      const j = await cur.json(); sha = j.sha;
      if (!force) {
        let rr = 0; try { rr = JSON.parse(td.decode(b64d(String(j.content || '').replace(/\s/g, '')))).rev || 0; } catch (e) {}
        if (rr > (WORK.baseRev || 0)) throw err('conflict');
      }
    } else if (cur.status !== 404) throw err('http', 'HTTP ' + cur.status);
    const put = await fetch(url, { method: 'PUT', headers: hd, body: JSON.stringify({ message, content: b64e(te.encode(content)), sha, branch: GH.branch }) });
    if (put.status === 401) throw err('auth');
    if (put.status === 403 || put.status === 404) throw err('perm');
    if (put.status === 409) throw err('conflict');
    if (!put.ok) throw err('http', 'HTTP ' + put.status);
  }
  async function publish(force, quiet) {
    if (!FULL || !KP || !KD) return;
    let tok = ls.get(LSK.tok);
    if (!tok) { tok = await askToken(false); if (!tok) return; }
    setStat('Publicant…');
    try {
      const rev = Math.max(REMOTE.rev || 0, WORK.baseRev || 0) + 1;
      const data = { v: 1, rev, savedAt: new Date().toISOString(), kdf: REMOTE.kdf, pub: await seal(KP, pubOf(S)), dm: await seal(KD, S) };
      await ghPut(tok, JSON.stringify(data), `Missions: canvis des del mode DM (rev ${rev})`, force);
      REMOTE = data; FULL = clone(S); WORK = { baseRev: rev, dirty: false, state: clone(S) }; ls.set(LSK.work, WORK);
      armedForce = false;
      setStat('Publicat. El wiki s’actualitza en un o dos minuts.');
      if (quiet || !dmOn) toast('Canvis publicats al wiki.');
      setTimeout(() => { if (statOverride.startsWith('Publicat')) { statOverride = ''; updateStat(); } }, 8000);
    } catch (e) {
      if (e.code === 'conflict') { armedForce = true; setStat('Hi ha una versió més nova al wiki: torna a publicar per sobreescriure-la'); }
      else if (e.code === 'auth') { ls.del(LSK.tok); setStat('La clau de GitHub no és vàlida'); }
      else if (e.code === 'perm') setStat('La clau no té permís per escriure al wiki');
      else setStat('No s’ha pogut publicar (' + e.message + ')');
      if (quiet || !dmOn) toast('No s’ha pogut publicar al wiki: ' + statOverride, 5000);
    }
  }

  /* =================================================================== entrada */
  let hintGone = false;
  function firstInput() { if (!hintGone) { hintGone = true; const h = $('#hint'); G.to(h, { opacity: 0, duration: 0.4 * D, onComplete: () => { h.hidden = true; } }); } }
  function setInput(kind) { stage.classList.toggle('kb', kind !== 'mouse'); if (input !== kind) { input = kind; renderPrompts(); } }
  const fullscreen = () => { const d = document.documentElement; if (!document.fullscreenElement) { if (d.requestFullscreen) d.requestFullscreen().catch(() => {}); } else if (document.exitFullscreen) document.exitFullscreen(); };
  function act(a) {
    if (T.zoom === 'map') {
      const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a];
      if (dv) placeNav(dv[0], dv[1]);
      else if (a === 'ok') {
        if (!T.place) placeNav(1, 0);
        else if (T.place === 'tauler') closeMap();
        else if (T.card === T.place) { const qs = questsAt(T.place); if (qs[0]) openDoc(qs[0].id); }
        else openCard(T.place);
      } else if (a === 'back') { if (T.card) closeCard(); else closeMap(); }
      else if (a === 'map') closeMap();
      return;
    }
    if (a === 'up') { if (!T.zoom) navDir(0, -1); }
    else if (a === 'down') { if (!T.zoom) navDir(0, 1); }
    else if (a === 'left') { if (T.zoom) stepZoom(-1); else navDir(-1, 0); }
    else if (a === 'right') { if (T.zoom) stepZoom(1); else navDir(1, 0); }
    else if (a === 'ok') { if (!T.zoom && T.focus) openKey(T.focus); else if (!T.zoom) navDir(1, 0); }
    else if (a === 'back') { if (T.zoom) closeAny(); }
    else if (a === 'map') openMap();
  }
  const typing = (t) => t && t.closest && t.closest('input,textarea,select,[contenteditable]');
  function bindInput() {
    document.addEventListener('keydown', (e) => {
      if (!$('#gate').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) return;
      firstInput(); setInput('kb');
      const k = e.key, map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', m: 'map', M: 'map' };
      if (map[k]) { e.preventDefault(); act(map[k]); }
      else if (k === 'f' || k === 'F') fullscreen();
      else if (k === 'd' || k === 'D') setDm(!dmOn);
    });
    document.addEventListener('click', (e) => {
      if (!$('#gate').hidden) return;
      firstInput();
      const t = e.target, path = e.composedPath ? e.composedPath() : [];
      if (path.some((n) => n && (n.id === 'dmbar' || n.id === 'dmcard' || n.id === 'chrome' || n.id === 'gate'))) return;
      if (T.zoom === 'map') {
        const qb = t.closest('#pcard [data-q]'); if (qb) { openDoc(qb.dataset.q); return; }
        if (t.closest('#pcard')) return;
        const pl = t.closest('.plc');
        if (pl) { const id = pl.dataset.p; setPlace(id); if (id === 'tauler') closeMap(); else if (T.card === id) closeCard(); else openCard(id); return; }
        if (T.card) { closeCard(); return; }
        if (!t.closest('#bmap')) closeMap();
        return;
      }
      if (T.zoom) {
        if (T.zEl && T.zEl.contains(t)) { onDocClick(e); return; }
        closeDoc(); return;
      }
      const d = t.closest('.doc'); if (d) { setFocus(d.dataset.id); openDoc(d.dataset.id); return; }
      if (t.closest('#pile')) { setFocus('pile'); openKey('pile'); return; }
      if (t.closest('#bmap')) { openMap(); }
    });
    document.addEventListener('mouseover', (e) => {
      if (!$('#gate').hidden) return;
      if (T.zoom === 'map') { if (e.target.closest('#pcard')) return; const pl = e.target.closest('.plc'); setPlace(pl ? pl.dataset.p : T.card); return; }
      if (T.zoom) return;
      const el = e.target.closest('.doc') || e.target.closest('#pile') || e.target.closest('#bmap');
      if (!el) return;
      const key = el.id === 'pile' ? 'pile' : el.id === 'bmap' ? 'map' : el.dataset.id;
      if (key !== T.focus) setFocus(key);
    });
    let idleT;
    const wake = () => { if (input !== 'mouse') setInput('mouse'); document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2600); };
    document.addEventListener('mousemove', wake); wake();
    $('#fsBtn').addEventListener('click', fullscreen);
    $('#dmBtn').addEventListener('click', () => setDm(!dmOn));
    const docsBox = $('#docs');
    docsBox.addEventListener('input', onDocInput);
    docsBox.addEventListener('keydown', onDocKey);
    docsBox.addEventListener('focusout', onDocBlur);
    docsBox.addEventListener('paste', (e) => { if (!typing(e.target)) return; e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    $('#dmcard').addEventListener('input', onCardInput);
    $('#dmcard').addEventListener('change', onCardInput);
    $('#dmcard').addEventListener('click', onCardClick);
    $('#dmbar').addEventListener('click', onBarClick);
    $('#dmbar').addEventListener('input', onBarInput);
    $('#pcard').addEventListener('input', (e) => {
      const f = e.target.closest('[data-place]'); if (!f || !dmOn) return;
      S.places[f.dataset.place] = { text: f.innerText.replace(/ /g, ' ').trim() }; markDirty();
    });
    $('#impFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      f.text().then((txt) => {
        const d = JSON.parse(txt); if (!d || !Array.isArray(d.quests)) throw new Error();
        const go = () => { S = normState(d); markDirty(); renderBoard(true); toast('Missions importades. Revisa-les i publica-les quan vulguis.'); };
        if (T.zoom) closeAny().then(go); else go();
      }).catch(() => toast('Aquest fitxer no és un tauler de missions vàlid.'));
      e.target.value = '';
    });
    const pad = { prev: {}, next: {} };
    function pollPad(now) {
      const gpd = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).find((g) => g && g.connected);
      if (gpd && $('#gate').hidden) {
        const b = (i) => !!(gpd.buttons[i] && gpd.buttons[i].pressed), ax = gpd.axes || [];
        const st = { up: b(12) || ax[1] < -0.6, down: b(13) || ax[1] > 0.6, left: b(14) || b(4) || ax[0] < -0.6, right: b(15) || b(5) || ax[0] > 0.6, ok: b(0), back: b(1), map: b(3) };
        Object.keys(st).forEach((k) => {
          const was = pad.prev[k];
          if (st[k] && (!was || now > (pad.next[k] || 0))) { pad.next[k] = now + (was ? 140 : 380); firstInput(); setInput('pad'); act(k); }
          pad.prev[k] = st[k];
        });
      }
      requestAnimationFrame(pollPad);
    }
    requestAnimationFrame(pollPad);
  }

  /* =================================================================== tauler: inici */
  function initTV() {
    renderLabels();
    const m = $('#bmap'); m.hidden = false;
    G.set(m, { rotation: MAP.r });
    Object.assign($('#pile').style, { left: PILE.x + 'px', top: PILE.y + 'px', width: PILE.w + 'px', height: PILE.h + 'px' });
    G.set('#pile', { rotation: PILE.r });
    renderBoard(false); renderPrompts(); bindInput();
    $('#chrome').classList.add('show');
    const h = $('#hint'); h.hidden = false;
    h.innerHTML = 'Fletxes per triar · <b>↵</b> obrir · <b>M</b> mapa · <b>F</b> pantalla completa';
    setTimeout(firstInput, 9000);
    const tl = window.gsap ? window.gsap.timeline() : null;
    if (tl) {
      tl.fromTo(m, { opacity: 0, y: -40, rotation: -3 }, { opacity: 1, y: 0, rotation: MAP.r, duration: 0.8 * D, ease: 'power3.out' }, 0.1 * D);
      const els = [$('#pile')].filter((el) => !el.hidden).concat(L.ids.map((id) => docs.get(id)).filter(Boolean));
      els.forEach((el, i) => {
        if (el.id === 'pile') { tl.fromTo(el, { opacity: 0, y: -70, rotation: PILE.r + 9 }, { opacity: 1, y: 0, rotation: PILE.r, duration: 0.55 * D, ease: 'back.out(1.3)' }, (0.3 + i * 0.05) * D); return; }
        const g = el._g, hh = homeOf(g);
        tl.fromTo(el, { opacity: 0, y: hh.y - 70, rotation: g.r + 9 }, { opacity: 1, y: hh.y, rotation: g.r, duration: 0.55 * D, ease: 'back.out(1.3)' }, (0.3 + i * 0.05) * D);
      });
    }
  }

  start();
})();

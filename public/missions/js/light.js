/* Llum: l'ombra d'arbres que cau sobre el tauler. Tres nivells, perquè el tauler sol anar en un ordinador que ja
   treballa molt durant la sessió:
   - «quieta»: l'ombra no es mou; en repòs la GPU no redibuixa res.
   - «suau» (per defecte): les dues capes d'ombra es mouen per JS ~8 cops per segon. El vent és tan lent que cada pas
     és de menys d'un píxel i no es nota, però són ~8 composicions per segon en lloc de 60.
   - «viva»: ombra en WebGL amb vent (soroll simplex). Quan s'obre un paper o el mapa, aquest "s'aixeca" cap a la
     càmera i surt de l'ombra (forat amb la seva forma, seguit cada fotograma). És la més cara.
   Es tria amb la tecla L o el botó «Llum» i es recorda en aquest navegador (?gl=1 força la viva). */
import { $, $$, D, REDUCED_MOTION, local } from './util.js';
import { gsap, isTweening } from './tween.js';
import { stage, toast } from './ui.js';

const FX_KEY = 'phx.fx';
export const FX_MODES = ['suau', 'quieta', 'viva'];
const FORCE_GL = /[?&]gl=1/.test(location.search);
const FX_SAY = {
  quieta: ': sense moviment, la més lleugera.',
  suau: ': moviment lent amb poc cost.',
  viva: ': la més bonica, però fa treballar la GPU.'
};

/* peça aixecada (paper o mapa ampliat): v va de 0 a 1 mentre s'acosta a la càmera */
export const LIFT = { v: 0, el: null, kind: '' };
/* rectangle girat de la peça aixecada en coordenades de l'escenari: [cx, cy, mig ample, mig alt, gir en radians] */
let holeOf = () => [0, 0, 0, 0, 0];
export const setHoleSource = (fn) => { holeOf = fn; };

let fx = '', gobo = null, swayT = 0;

export function setFx(m, say) {
  if (m === 'viva' && !gobo) gobo = initGobo() || false;
  if (m === 'viva' && !gobo) {
    if (say) toast('Aquest ordinador no té GPU per a la llum viva; queda la suau.');
    m = 'suau';
    say = false;
  }
  fx = m;
  FX_MODES.forEach((k) => stage.classList.toggle('fx-' + k, k === m));
  if (gobo) gobo.run(m === 'viva');
  clearInterval(swayT);
  swayT = 0;
  if (m === 'suau' && !REDUCED_MOTION) { swayT = setInterval(sway, 125); sway(); }
  else $$('.gobo').forEach((g) => { g.style.transform = ''; });
  $('#fxBtn').textContent = 'Llum: ' + m;
  if (say) toast('Llum ' + m + FX_SAY[m]);
}
export function initFx() {
  const saved = local.get(FX_KEY);
  setFx(FORCE_GL ? 'viva' : FX_MODES.includes(saved) ? saved : 'suau');
}
export function cycleFx() {
  setFx(FX_MODES[(FX_MODES.indexOf(fx) + 1) % FX_MODES.length], true);
  local.set(FX_KEY, fx);
}

/* llum suau: el mateix balanceig que tenien les animacions CSS (13 s i 6,5 s, anada i tornada), a pocs fotogrames.
   a i b: [x, y, gir, escala] als dos extrems */
const SWAY = [
  { p: 13, a: [0, 0, 0, 1], b: [-16, 8, 0.4, 1] },
  { p: 6.5, a: [7, -4, -0.3, 1.01], b: [-11, 7, 0.5, 1.014] }
];
const goboEls = $$('.gobo');
function sway() {
  if (document.hidden) return;
  const t = performance.now() / 1000;
  SWAY.forEach((g, i) => {
    const el = goboEls[i];
    if (!el) return;
    const k = 0.5 - 0.5 * Math.cos(Math.PI * t / g.p), v = g.a.map((a, j) => a + (g.b[j] - a) * k);
    el.style.transform = `translate(${v[0].toFixed(2)}px,${v[1].toFixed(2)}px) rotate(${v[2].toFixed(3)}deg) scale(${v[3].toFixed(4)})`;
  });
}

/* el paper surt de l'ombra de seguida en aixecar-se i hi torna just quan aterra */
export function liftTo(el, kind, on, landAt) {
  if (on) { LIFT.el = el; LIFT.kind = kind; stage.classList.add('lift'); }
  else stage.classList.remove('lift');
  const o = on
    ? { v: 1, duration: (kind === 'map' ? 0.3 : 0.42) * D, delay: 0.04 * D, ease: 'power1.out' }
    : { v: 0, duration: 0.26 * D, delay: (landAt || 0.4) * D, ease: 'power1.in' };
  if (gsap) gsap.to(LIFT, Object.assign({ overwrite: true }, o));
  else LIFT.v = on ? 1 : 0;
}

/* ---------- llum viva (WebGL) ---------- */
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

function initGobo() {
  const cv = $('#goboGL');
  if (!cv) return null;
  let gl = null;
  try { gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { /* sense WebGL */ }
  if (!gl) return null;
  /* amb una GPU per programari la llum viva aniria a batzegades: millor la suau */
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (!FORCE_GL && dbg && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)))) return null;

  const shader = (type, src) => {
    const o = gl.createShader(type);
    gl.shaderSource(o, src);
    gl.compileShader(o);
    if (gl.getShaderParameter(o, gl.COMPILE_STATUS)) return o;
    console.warn(gl.getShaderInfoLog(o));
    return null;
  };
  const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram();
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  /* un sol triangle que cobreix tota la pantalla */
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const la = gl.getAttribLocation(pr, 'a');
  gl.enableVertexAttribArray(la);
  gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['uTex', 'uRes', 'uT', 'uGust', 'uSway', 'uCol', 'uStr', 'uHole', 'uHoleR', 'uLift', 'uRem'].forEach((n) => { U[n] = gl.getUniformLocation(pr, n); });
  gl.uniform2f(U.uRes, cv.width, cv.height);
  gl.uniform3f(U.uCol, 16 / 255, 18 / 255, 26 / 255);
  gl.uniform2f(U.uStr, 0.36, 0.12);
  gl.uniform1i(U.uTex, 0);

  let on = false, ready = false, raf = 0;
  const img = new Image();
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    ready = true;
    run(on);
  };
  img.src = 'assets/gobo-sh.webp';

  const t0 = performance.now();
  let last = 0, drawn = 0, n = 0, slow = 0;
  function run(v) {
    on = v;
    cancelAnimationFrame(raf);
    raf = 0;
    stage.classList.toggle('gl', on && ready);
    if (on && ready) { last = 0; n = 0; slow = 0; drawn = 0; raf = requestAnimationFrame(frame); }
  }
  function frame(now) {
    raf = 0;
    if (!on) return;
    /* si l'ordinador no arriba a 20 fps de manera sostinguda, es passa a la llum suau */
    if (last && !FORCE_GL && ++n > 20) {
      slow = now - last > 50 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 25) { setFx('suau'); toast("L'ordinador va just: passo a la llum suau."); return; }
    }
    last = now;
    /* el vent és lent: n'hi ha prou amb ~30 fps i deixa la GPU lliure per als papers;
       mentre un paper vola es dibuixa cada fotograma perquè el forat de l'ombra el segueixi */
    const moving = LIFT.el && ((LIFT.v > 0.001 && LIFT.v < 0.999) || isTweening(LIFT.el));
    if (!moving && now - drawn < 30) { raf = requestAnimationFrame(frame); return; }
    drawn = now;
    const t = REDUCED_MOTION ? 30 : (now - t0) / 1000 + 30;
    const gust = 0.62 + 0.2 * Math.sin(t * 0.29) + 0.12 * Math.sin(t * 0.71 + 1.3) + 0.07 * Math.sin(t * 1.63 + 0.4);
    gl.uniform1f(U.uT, t);
    gl.uniform1f(U.uGust, gust);
    gl.uniform2f(U.uSway, (7 * Math.sin(t * 0.23) + 3 * Math.sin(t * 0.61 + 2)) * gust, (3.5 * Math.sin(t * 0.19 + 1) + 2 * Math.sin(t * 0.47)) * gust);
    const h = LIFT.el && LIFT.v >= 0.001 ? holeOf(LIFT) : [0, 0, 0, 0, 0];
    gl.uniform4f(U.uHole, h[0], h[1], h[2], h[3]);
    gl.uniform1f(U.uHoleR, h[4]);
    gl.uniform1f(U.uLift, LIFT.el ? LIFT.v : 0);
    gl.uniform1f(U.uRem, LIFT.kind === 'map' ? 0 : 0.08);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  return { run };
}

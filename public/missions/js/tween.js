/* GSAP (assets/gsap.min.js), o una versió mínima que aplica els valors finals si no ha carregat. */
import { $$ } from './util.js';

function fallback() {
  const list = (t) => (typeof t === 'string' ? $$(t) : t == null ? [] : (t.length != null && !t.nodeType ? Array.from(t) : [t]));
  const apply = (t, v) => list(t).forEach((el) => {
    if (!el) return;
    if (!el.style) { Object.keys(v).forEach((k) => { if (typeof v[k] === 'number') el[k] = v[k]; }); return; }
    ['left', 'top', 'width', 'height'].forEach((k) => { if (k in v) el.style[k] = v[k] + 'px'; });
    if ('opacity' in v) el.style.opacity = v.opacity;
    const st = el._t || (el._t = { x: 0, y: 0, scale: 1, rotation: 0 });
    ['x', 'y', 'scale', 'rotation'].forEach((k) => { if (k in v) st[k] = v[k]; });
    el.style.transform = `translate(${st.x}px,${st.y}px) rotate(${st.rotation}deg) scale(${st.scale})`;
  });
  const done = (v) => { if (v && v.onComplete) setTimeout(v.onComplete, 0); };
  return {
    set: (t, v) => apply(t, v),
    to: (t, v) => { apply(t, v); done(v); },
    fromTo: (t, _from, to) => { apply(t, to); done(to); },
    killTweensOf() {},
    isTweening: () => false,
    getProperty: (el, k) => (el._t ? el._t[k === 'scaleX' || k === 'scaleY' ? 'scale' : k] : 0) || 0
  };
}

export const gsap = window.gsap || null;
export const G = gsap || fallback();
/* valor numèric actual d'una propietat animada (x, y, rotation, scaleX…) */
export const gp = (el, k) => +G.getProperty(el, k) || 0;
export const isTweening = (el) => G.isTweening(el);

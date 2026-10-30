/* Escenari fix de 1920×1080 escalat a la finestra, i avisos. */
import { $, D } from './util.js';
import { G } from './tween.js';
import { STAGE_W, STAGE_H } from './layout.js';

export const stage = $('#stage');

let sc = 1, sox = 0, soy = 0;
export function fit() {
  sc = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  sox = (innerWidth - STAGE_W * sc) / 2;
  soy = (innerHeight - STAGE_H * sc) / 2;
  stage.style.transform = `translate(${sox}px,${soy}px) scale(${sc})`;
}
/* coordenades de l'escenari d'un esdeveniment del ratolí */
export const toStage = (e) => ({ x: (e.clientX - sox) / sc, y: (e.clientY - soy) / sc });

export function fatal(msg) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.textContent = msg;
  document.body.appendChild(d);
}

let toastT;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastT);
  G.fromTo(t, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3 * D, overwrite: true });
  toastT = setTimeout(() => G.to(t, { opacity: 0, duration: 0.4 * D }), ms);
}

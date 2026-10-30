/* La «porta»: un paper amb un camp per a la contrasenya del grup, la del DM o la clau de GitHub. */
import { $, D, esc } from './util.js';
import { routes } from '../lib/site';
import { gsap } from 'gsap';

const gate = $('#gate');
export const gateOpen = () => !gate.hidden;

/* Mostra la porta i resol amb el valor acceptat, o null si es cancel·la.
   o.check(valor) retorna un missatge d'error o null si el valor és bo. o.text pot portar HTML (és fix). */
export function askGate(o) {
  return new Promise((resolve) => {
    gate.innerHTML = `<form class="gate-p${o.wide ? ' wide' : ''}" autocomplete="off" novalidate>
      <div class="gate-k">${esc(o.kicker)}</div><h1 class="gate-t">${esc(o.title)}</h1>${o.text ? `<p class="gate-s">${o.text}</p>` : ''}
      <div class="gate-f"><input type="${o.type || 'password'}" placeholder="${esc(o.ph || '')}" spellcheck="false" autocapitalize="off" autocomplete="off"><button class="btn pri" type="submit">${esc(o.btn || 'Entrar')}</button></div>
      <div class="gate-e"></div>${o.cancel ? `<button type="button" class="gate-x" data-x>${esc(o.cancel)}</button>` : ''}${o.back ? `<a class="gate-x" href="${routes.home}">← Tornar al wiki</a>` : ''}</form>`;
    gate.hidden = false;
    const f = gate.firstElementChild, inp = $('input', f), err = $('.gate-e', f);
    gsap.fromTo(f, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45 * D, ease: 'power3.out' });
    setTimeout(() => inp.focus(), 60);
    let busy = false;
    const close = (v) => gsap.to(f, { opacity: 0, y: -20, duration: 0.3 * D, onComplete: () => { gate.hidden = true; gate.innerHTML = ''; resolve(v); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const val = inp.value;
      if (!val.trim()) return;
      busy = true;
      err.textContent = 'Comprovant…';
      let msg = null;
      try { msg = await o.check(val); } catch (ex) { msg = 'No ha funcionat: ' + ex.message; }
      busy = false;
      if (!msg) { close(val); return; }
      err.textContent = msg;
      f.classList.remove('shake');
      void f.offsetWidth; // reinicia l'animació
      f.classList.add('shake');
      inp.select();
    });
    const x = $('[data-x]', f);
    if (x) x.addEventListener('click', () => close(null));
    f.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' && o.cancel) close(null);
    });
  });
}

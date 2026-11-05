import type { Frase } from './format.ts';

/** Marge abans i després del clip, perquè no talli la primera ni l'última síl·laba. */
export const MARGE_ABANS = 0.35;
export const MARGE_DESPRES = 0.6;
/** Als vídeos amb les hores de les paraules estimades, una mica més, per si de cas. */
export const MARGE_APROXIMAT = 1.5;
/** Una frase més llarga que això no es reprodueix sencera: només el tros del voltant de la troballa. */
export const MAX_FRASE = 9;
const CONTEXT_ABANS = 2.5;
const CONTEXT_DESPRES = 2;

/** El tros del vídeo (en segons) que es reprodueix per a les paraules `a`…`b` d'una frase. */
export function retall(f: Frase, a: number, b: number, aproximat = false): { inici: number; fi: number } {
  let inici = f.inici;
  let fi = f.fi;
  if (fi - inici > MAX_FRASE) {
    const t = f.temps;
    // comença a l'inici d'una paraula i acaba just abans de l'inici d'una altra, sense sortir de la frase
    let i = a;
    while (i > 0 && t[i - 1] >= t[a] - CONTEXT_ABANS) i--;
    const finsA = b + 1 < t.length ? t[b + 1] : f.fi;
    let j = b + 1;
    while (j < t.length && t[j] <= finsA + CONTEXT_DESPRES) j++;
    inici = t[i];
    fi = j < t.length ? t[j] : f.fi;
  }
  const extra = aproximat ? MARGE_APROXIMAT : 0;
  return { inici: Math.max(0, inici - MARGE_ABANS - extra), fi: fi + MARGE_DESPRES + extra };
}

/** 4521.3 → "1:15:21" */
export function hms(segons: number): string {
  const s = Math.floor(segons);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

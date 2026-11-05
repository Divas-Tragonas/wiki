import type { Frase } from './format.ts';

/*
 * Cerca de frases: paraules senceres i seguides, sense majúscules, accents ni puntuació.
 * «que fas» troba «Què fas?», «ultima» troba «l'última» i «colleccio» troba «col·lecció».
 */

/** Minúscules, sense accents i amb la ela geminada junta. */
export function plega(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/l[·.•]l/g, 'll')
    .replace(/ŀl/g, 'll');
}

/** Les peces que es comparen d'un text: «L'última, oi?» → ["l", "ultima", "oi"]. */
export function peces(text: string): string[] {
  return plega(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export interface FrasePreparada {
  /** les peces separades i envoltades per espais (" l ultima oi "): la primera passada és un `includes` */
  pla: string;
  peces: string[];
  /** de quina paraula ve cada peça */
  paraula: number[];
}

export function prepara(frases: Frase[]): FrasePreparada[] {
  return frases.map((f) => {
    const totes: string[] = [];
    const paraula: number[] = [];
    f.paraules.forEach((p, i) => {
      for (const peca of peces(p)) {
        totes.push(peca);
        paraula.push(i);
      }
    });
    return { pla: ` ${totes.join(' ')} `, peces: totes, paraula };
  });
}

export interface Troballa {
  /** índex de la frase */
  frase: number;
  /** primera i última paraula que coincideixen */
  a: number;
  b: number;
  /** false: l'última paraula de la cerca només és el començament d'una paraula de la frase («drac» → «dracs») */
  exacta: boolean;
}

/** Totes les frases on surt la cerca, per ordre: primer les que la tenen sencera i després les que acaben en una
 *  paraula més llarga (mentre s'escriu, «hola co» ja troba «hola com estàs»). Dins de cada grup, per ordre de vídeo. */
export function cerca(preparades: FrasePreparada[], consulta: string): Troballa[] {
  const q = peces(consulta);
  if (!q.length) return [];
  const exacte = ` ${q.join(' ')} `;
  const inici = ` ${q.join(' ')}`;
  const exactes: Troballa[] = [];
  const parcials: Troballa[] = [];
  preparades.forEach((p, frase) => {
    if (!p.pla.includes(inici)) return;
    const pos = posicio(p.peces, q);
    if (!pos) return;
    const t = { frase, a: p.paraula[pos.i], b: p.paraula[pos.i + q.length - 1], exacta: pos.exacta };
    (pos.exacta ? exactes : parcials).push(t);
  });
  return [...exactes, ...parcials];
}

/** On comencen les peces `q` dins de `peces` (preferint una coincidència sencera). */
function posicio(peces: string[], q: string[]): { i: number; exacta: boolean } | null {
  let parcial: number | null = null;
  const n = q.length;
  for (let i = 0; i + n <= peces.length; i++) {
    let k = 0;
    while (k < n - 1 && peces[i + k] === q[k]) k++;
    if (k < n - 1) continue;
    const ultima = peces[i + n - 1];
    if (ultima === q[n - 1]) return { i, exacta: true };
    if (parcial === null && ultima.startsWith(q[n - 1])) parcial = i;
  }
  return parcial === null ? null : { i: parcial, exacta: false };
}

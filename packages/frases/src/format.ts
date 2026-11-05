/*
 * Les frases dels vídeos: el que escriu `scripts/frases/frases.py` (un fitxer per vídeo a `frases/<id>.json`)
 * i l'índex compacte que en fa el build (`/wiki/frases.json`) per al cercador.
 */

/** Una frase tal com la desa la transcripció: [inici, fi, text, inici de cada paraula], temps en ms des de l'inici
 *  del vídeo (les paraules, des de l'inici de la frase). El text són les paraules separades per un sol espai. */
export type FraseFitxer = [inici: number, fi: number, text: string, paraules: number[]];

/** `frases/<id>.json`: un vídeo de YouTube transcrit. */
export interface FitxerVideo {
  id: string;
  titol: string;
  /** AAAA-MM-DD */
  data: string;
  /** segons */
  durada: number;
  idioma: string;
  /** les hores de les paraules són estimades (vegeu `de-transcripcio` a scripts/frases/frases.py): només la de
   *  l'inici de cada paràgraf és exacta, i el cercador hi deixa més marge */
  aproximat?: boolean;
  frases: FraseFitxer[];
}

export interface VideoInfo {
  id: string;
  titol: string;
  data: string;
  durada: number;
  aproximat?: boolean;
}

/** [vídeo, inici, durada, text, salts]: temps en centèsimes; cada salt és el que va de l'inici de la paraula anterior
 *  (o de la frase, per a la primera) a l'inici d'aquesta. Així els números són curts i l'índex pesa la meitat. */
export type FraseIndex = [video: number, inici: number, durada: number, text: string, salts: number[]];

export interface IndexFrases {
  versio: 1;
  videos: VideoInfo[];
  frases: FraseIndex[];
}

/** Una frase a punt per reproduir: temps en segons des de l'inici del vídeo. */
export interface Frase {
  video: number;
  inici: number;
  fi: number;
  text: string;
  paraules: string[];
  /** inici de cada paraula */
  temps: number[];
}

const cs = (ms: number) => Math.round(ms / 10);

/** Comprova un fitxer de vídeo i hi diu on és el problema: el build falla abans de publicar un índex trencat. */
export function validaVideo(v: FitxerVideo, nom = v?.id ?? '?'): void {
  const err = (m: string) => {
    throw new Error(`frases/${nom}.json: ${m}`);
  };
  if (!v || typeof v.id !== 'string' || !/^[\w-]{6,}$/.test(v.id)) err('falta un id de YouTube vàlid');
  if (typeof v.titol !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.data ?? '')) err('falta el títol o la data (AAAA-MM-DD)');
  if (!Array.isArray(v.frases)) err('falta la llista de frases');
  v.frases.forEach((f, i) => {
    const [inici, fi, text, paraules] = f;
    if (!(inici >= 0 && fi >= inici) || typeof text !== 'string' || !Array.isArray(paraules)) err(`la frase ${i} no té el format [inici, fi, text, paraules]`);
    if (text.split(' ').length !== paraules.length) err(`la frase ${i} té ${text.split(' ').length} paraules i ${paraules.length} temps`);
  });
}

export function empaqueta(fitxers: FitxerVideo[]): IndexFrases {
  const videos = [...fitxers].sort((a, b) => a.data.localeCompare(b.data) || a.titol.localeCompare(b.titol));
  const frases: FraseIndex[] = [];
  videos.forEach((v, vi) => {
    for (const [inici, fi, text, paraules] of [...v.frases].sort((a, b) => a[0] - b[0])) {
      let anterior = cs(inici);
      const salts = paraules.map((p) => {
        const t = cs(inici + p);
        const salt = Math.max(0, t - anterior);
        anterior += salt;
        return salt;
      });
      frases.push([vi, cs(inici), cs(fi) - cs(inici), text, salts]);
    }
  });
  return {
    versio: 1,
    videos: videos.map(({ id, titol, data, durada, aproximat }) => ({ id, titol, data, durada, ...(aproximat ? { aproximat } : {}) })),
    frases,
  };
}

export function desempaqueta(index: IndexFrases): Frase[] {
  return index.frases.map(([video, inici, durada, text, salts]) => {
    let t = inici;
    const temps = salts.map((s) => (t += s) / 100);
    return { video, inici: inici / 100, fi: (inici + durada) / 100, text, paraules: text.split(' '), temps };
  });
}

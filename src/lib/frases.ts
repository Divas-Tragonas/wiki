import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validaVideo, type FitxerVideo } from '@mina/frases';

/* Els vídeos transcrits per al cercador de frases: `frases/<id de YouTube>.json` a l'arrel del repositori
   (els escriu `scripts/frases/frases.py`). Si un fitxer no té el format bo, el build falla i diu quin. */
const DIR = resolve('frases');

let cache: FitxerVideo[] | null = null;

export function videosTranscrits(): FitxerVideo[] {
  if (cache) return cache;
  const noms = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
  cache = noms.map((nom) => {
    const id = nom.replace(/\.json$/, '');
    const video = JSON.parse(readFileSync(join(DIR, nom), 'utf-8')) as FitxerVideo;
    validaVideo(video, id);
    if (video.id !== id) throw new Error(`frases/${nom}: el fitxer s'ha de dir com l'id del vídeo (${video.id}.json)`);
    return video;
  });
  return cache;
}

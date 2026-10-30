import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

let cache: Map<string, Date> | null = null;

/* Data de l'últim commit que ha tocat cada fitxer de contingut, amb una sola crida a git per a tot el repositori.
   Cal l'historial sencer (al workflow, `fetch-depth: 0`): amb un clon superficial tots els fitxers tindrien la data
   de l'últim commit. */
function commitDates(): Map<string, Date> {
  if (cache) return cache;
  cache = new Map();
  try {
    const out = execFileSync('git', ['-c', 'core.quotePath=false', 'log', '--format=@%cI', '--name-only', '--', 'src/content'], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let current: Date | null = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('@')) current = new Date(line.slice(1));
      else if (line && current && !cache.has(line)) cache.set(line, current);
    }
  } catch {
    /* sense git (o sense historial) cada fitxer cau a la data de modificació */
  }
  return cache;
}

/* Últim canvi d'un fitxer: el seu últim commit o, si encara no s'ha desat a git, la data de modificació. */
export function lastModified(filePath?: string): Date {
  if (!filePath) return new Date(0);
  const committed = commitDates().get(filePath);
  if (committed) return committed;
  try {
    return statSync(filePath).mtime;
  } catch {
    return new Date(0);
  }
}

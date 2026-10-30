/* Publicar data.json al repositori del wiki amb l'API de GitHub (el workflow de Pages republica el lloc). */
import { b64ToUtf8, utf8ToB64 } from './crypto.js';

export const GH = { owner: 'divas-tragonas', repo: 'wiki', path: 'public/missions/data.json', branch: 'master' };
const API = `https://api.github.com/repos/${GH.owner}/${GH.repo}`;
const headers = (tok) => ({ Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

/* null si la clau pot escriure al repositori; si no, el motiu */
export async function checkToken(tok) {
  const r = await fetch(API, { headers: headers(tok) });
  if (r.status === 401) return 'GitHub no reconeix aquesta clau';
  if (!r.ok) return 'Aquesta clau no pot veure el repositori del wiki';
  const j = await r.json();
  if (j.permissions && !j.permissions.push) return 'Aquesta clau no té permís d’escriptura';
  return null;
}

/* Desa el fitxer. Si no és forçat, falla amb code 'conflict' quan el que hi ha publicat és més nou que baseRev
   (algú altre ha publicat des que es van carregar les dades). Altres codis: 'auth', 'perm', 'http'. */
export async function putData(tok, content, message, { force, baseRev }) {
  const url = `${API}/contents/${GH.path}`;
  const cur = await fetch(`${url}?ref=${GH.branch}&_=${Date.now()}`, { headers: headers(tok), cache: 'no-store' });
  if (cur.status === 401) throw fail('auth');
  let sha;
  if (cur.ok) {
    const j = await cur.json();
    sha = j.sha;
    if (!force) {
      let rev = 0;
      try { rev = JSON.parse(b64ToUtf8(String(j.content || '').replace(/\s/g, ''))).rev || 0; } catch (e) { /* fitxer il·legible: es sobreescriu */ }
      if (rev > (baseRev || 0)) throw fail('conflict');
    }
  } else if (cur.status !== 404) throw fail('http', 'HTTP ' + cur.status);
  const put = await fetch(url, { method: 'PUT', headers: headers(tok), body: JSON.stringify({ message, content: utf8ToB64(content), sha, branch: GH.branch }) });
  if (put.status === 401) throw fail('auth');
  if (put.status === 403 || put.status === 404) throw fail('perm');
  if (put.status === 409) throw fail('conflict');
  if (!put.ok) throw fail('http', 'HTTP ' + put.status);
}

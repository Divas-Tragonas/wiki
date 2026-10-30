/* Client de l'API de missions (la Mac mini). L'adreça ve de PUBLIC_MISSIONS_API_URL en fer el build.
   La sessió és una clau (bearer) que es guarda en aquest navegador; el canal d'esdeveniments es llegeix amb fetch
   (EventSource no pot enviar la clau) i es reconnecta sol, demanant els canvis que s'hagi perdut. */
import { local } from './util.js';

const BASE = String(import.meta.env.PUBLIC_MISSIONS_API_URL || '').replace(/\/+$/, '');
const TOKEN_KEY = 'phx.token';

export const apiConfigured = () => !!BASE;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
/* sense connexió amb el servidor (es pot tornar a provar) */
export const isOffline = (e) => e instanceof ApiError && (e.status === 0 || e.status >= 502);

let token = local.get(TOKEN_KEY);
export const hasToken = () => !!token;
function setToken(t) {
  token = t || null;
  if (token) local.set(TOKEN_KEY, token);
  else local.del(TOKEN_KEY);
}

export async function request(method, path, { body, ifMatch, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (ifMatch !== undefined) headers['If-Match'] = String(ifMatch);
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: 'no-store' });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'No hi ha connexió amb el servidor');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data && data.error;
    throw new ApiError(res.status, err ? err.code : 'http', err ? err.message : 'Error ' + res.status, err && err.details);
  }
  return data;
}

/* ---------- sessió ---------- */
export async function getSession() {
  if (!token) return null;
  try {
    return await request('GET', '/v1/session');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setToken(null);
      return null;
    }
    throw e;
  }
}
export async function login(role, password) {
  const r = await request('POST', '/v1/session', { body: { role, password, label: deviceLabel() } });
  if (r.token) setToken(r.token);
  return r;
}
export const leaveDm = () => request('POST', '/v1/session/player');
export function forgetSession() {
  setToken(null);
}
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPad|iPhone/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositiu';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${br} · ${os}`;
}

/* ---------- canal d'esdeveniments ---------- */
/* onChange(rev, events) per cada canvi; onState('live' | 'offline') quan canvia la connexió; onAuth() si la sessió ja
   no val. since() dona la revisió que ja té el tauler (per demanar només el que falta). */
export function subscribe(town, { since, onChange, onState, onAuth }) {
  let stopped = false, ctl = null, delay = 1000;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    while (!stopped) {
      ctl = new AbortController();
      try {
        const res = await fetch(`${BASE}/v1/events?town=${encodeURIComponent(town)}`, {
          headers: { Authorization: 'Bearer ' + token, 'Last-Event-ID': String(since()) },
          signal: ctl.signal,
          cache: 'no-store'
        });
        if (res.status === 401) { onAuth(); return; }
        if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
        await readFrames(res.body, (f) => {
          if (f.event === 'hello') { delay = 1000; onState('live'); }
          else if (f.event === 'change') onChange(Number(f.id), f.data.events || []);
        });
      } catch (e) {
        if (stopped) return;
      }
      if (stopped) return;
      onState('offline');
      await wait(delay);
      delay = Math.min(delay * 2, 15000);
    }
  })();
  return () => {
    stopped = true;
    if (ctl) ctl.abort();
  };
}

async function readFrames(body, onFrame) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!block || block.startsWith(':')) continue;
      const f = { event: 'message', id: null, data: null };
      const data = [];
      for (const line of block.split('\n')) {
        const k = line.indexOf(':');
        const key = line.slice(0, k), val = line.slice(k + 1).replace(/^ /, '');
        if (key === 'event') f.event = val;
        else if (key === 'id') f.id = val;
        else if (key === 'data') data.push(val);
      }
      try {
        f.data = data.length ? JSON.parse(data.join('\n')) : null;
      } catch {
        continue;
      }
      onFrame(f);
    }
  }
}

/* Xifratge de data.json: AES-GCM amb una clau derivada de la contrasenya (PBKDF2-SHA256). */
import { normText } from './util.js';

const te = new TextEncoder(), td = new TextDecoder();

export function b64encode(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64decode(s) {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
export const utf8ToB64 = (s) => b64encode(te.encode(s));
export const b64ToUtf8 = (s) => td.decode(b64decode(s));

/* les contrasenyes no distingeixen majúscules ni espais de més */
export async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(normText(pass)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64decode(salt), iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

/* null si la clau no és la bona */
export async function unseal(key, blob) {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(blob.iv) }, key, b64decode(blob.ct));
    return JSON.parse(td.decode(plain));
  } catch (e) {
    return null;
  }
}

export async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) };
}

/* les claus es guarden al navegador (no la contrasenya) per no haver-la d'escriure cada cop */
export const exportKey = async (k) => b64encode(new Uint8Array(await crypto.subtle.exportKey('raw', k)));
export async function importKey(s) {
  try {
    return await crypto.subtle.importKey('raw', b64decode(s), 'AES-GCM', true, ['encrypt', 'decrypt']);
  } catch (e) {
    return null;
  }
}

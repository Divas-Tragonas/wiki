/* Identificadors curts i aleatoris (navegador i Node): prefix + 12 caràcters base36 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newId(prefix: string): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

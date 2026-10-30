/* Importar i exportar en el format antic (el de «Exportar» del tauler), i llegir el data.json xifrat d'abans. */
import { webcrypto } from 'node:crypto';
import { fromLegacy, toLegacy, type TownId } from '@mina/model';
import type { Db } from '../db/client.ts';
import { invalid } from '../errors.ts';
import * as repo from '../store/repo.ts';
import { mutate, type Actor } from '../store/uow.ts';
import { mergeBoard } from './domain.ts';
import { createSnapshot } from './snapshots.ts';
import { describe } from './summaries.ts';

export async function exportAll(db: Db) {
  const data = await repo.loadAll(db);
  return { format: 'mina-missions', exportedAt: new Date().toISOString(), rev: await repo.currentRev(db), ...toLegacy(data) };
}

function assertImportable(input: unknown) {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { quests?: unknown }).quests)) {
    throw invalid('bad_import', 'Aquest fitxer no és un tauler de missions vàlid');
  }
}

/* substitueix-ho tot (amb una còpia de l'estat d'abans) */
export async function importReplace(db: Db, actor: Actor, input: unknown, now = new Date()) {
  assertImportable(input);
  const { data, skipped } = fromLegacy(input);
  await createSnapshot(db, 'pre-import', 'Abans d’importar una còpia sencera', now);
  const committed = await mutate(
    db, actor, 'import.replace',
    async (uow) => {
      await repo.replaceAll(uow.tx, data, now);
      uow.markReload();
    },
    describe('import.replace'),
    now
  );
  return { ...committed, result: { quests: data.quests.length, ecos: data.ecos.length, skipped } };
}

export async function importMerge(db: Db, actor: Actor, input: unknown, town: TownId, now = new Date()) {
  assertImportable(input);
  return mutate(db, actor, 'import.merge', (uow) => mergeBoard(uow, input, town), describe('import.merge'), now);
}

/* El data.json d'abans de l'API: dues parts xifrades amb AES-GCM i una clau PBKDF2 de la contrasenya; la del DM té
   tota la campanya. Les contrasenyes s'escrivien sense distingir majúscules ni espais de més. */
export async function decryptLegacyDataJson(file: unknown, dmPassword: string): Promise<unknown> {
  const f = file as { kdf?: { iter?: number; sd?: string }; dm?: { iv?: string; ct?: string } };
  if (!f?.kdf?.sd || !f.kdf.iter || !f.dm?.iv || !f.dm?.ct) throw new Error('Aquest fitxer no és un data.json del tauler');
  const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));
  const norm = String(dmPassword || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const base = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(norm), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(f.kdf.sd), iterations: f.kdf.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  let plain: ArrayBuffer;
  try {
    plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(f.dm.iv) }, key, b64(f.dm.ct));
  } catch {
    throw new Error('La contrasenya del DM no obre aquest data.json');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

/* Connexió a la base de dades: Postgres en producció (postgres://…) o PGlite, un Postgres dins del procés, per
   desenvolupar i per als tests sense instal·lar res (pglite://memory o pglite://<carpeta>). */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Database {
  db: Db;
  kind: 'postgres' | 'pglite';
  close: () => Promise<void>;
}

/* en el codi font les migracions són al costat d'aquest fitxer; al build, a dist/migrations */
export function migrationsFolder(): string {
  for (const rel of ['./migrations', './db/migrations']) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(p)) return p;
  }
  throw new Error('No trobo les migracions de la base de dades');
}

export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('pglite://')) {
    const target = url.slice('pglite://'.length);
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    const db = drizzle(client, { schema }) as unknown as Db;
    return { db, kind: 'pglite', close: () => client.close() };
  }
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, kind: 'postgres', close: () => client.end({ timeout: 5 }) };
}

export async function migrate(database: Database): Promise<void> {
  const folder = migrationsFolder();
  if (database.kind === 'pglite') {
    const { migrate: run } = await import('drizzle-orm/pglite/migrator');
    await run(database.db as never, { migrationsFolder: folder });
  } else {
    const { migrate: run } = await import('drizzle-orm/postgres-js/migrator');
    await run(database.db as never, { migrationsFolder: folder });
  }
}

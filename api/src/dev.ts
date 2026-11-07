/* Servidor per desenvolupar: PGlite a api/.dev-data (no cal Postgres), qualsevol origen i la contrasenya del DM de prova
   («dm») si encara no n'hi ha (el tauler s'obre sense contrasenya). Amb SEED=fitxer.json importa aquell fitxer en arrencar. */
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { hashPassword } from './auth/passwords.ts';
import { hasPassword, setPasswordHash } from './auth/sessions.ts';
import { loadConfig } from './config.ts';
import { startRuntime } from './runtime.ts';
import { importReplace } from './services/transfer.ts';

const config = loadConfig({
  DATABASE_URL: process.env.DATABASE_URL || 'pglite://./.dev-data',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
  PORT: process.env.PORT || '8787',
  HOST: process.env.HOST || '127.0.0.1',
  PING_INTERVAL_MS: process.env.PING_INTERVAL_MS,
  LOG_REQUESTS: process.env.LOG_REQUESTS || '0'
});
const rt = await startRuntime(config);
const db = rt.database.db;
if (!(await hasPassword(db, 'dm'))) await setPasswordHash(db, 'dm', await hashPassword('dm'), new Date());
if (process.env.SEED) {
  await importReplace(db, { role: 'dm', sessionId: null }, JSON.parse(readFileSync(process.env.SEED, 'utf8')));
  await rt.hub.poke();
}
serve({ fetch: rt.app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`missions-api (desenvolupament) a http://${info.address}:${info.port} · contrasenya del DM «dm»`);
});

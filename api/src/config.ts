/* Configuració des de l'entorn (a la Mac mini, el fitxer .env que llegeix el servei). */
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(8787),
  /* orígens del wiki que poden fer servir l'API, separats per comes («*» només per desenvolupar) */
  ALLOWED_ORIGINS: z.string().default('http://localhost:4321'),
  /* darrere de Cloudflare: la IP real ve a CF-Connecting-IP (per limitar els intents de contrasenya) */
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
  PING_INTERVAL_MS: z.coerce.number().int().positive().default(25_000),
  LOG_REQUESTS: z.enum(['0', '1']).default('1')
});

export interface Config {
  databaseUrl: string;
  host: string;
  port: number;
  allowedOrigins: string[];
  trustProxy: boolean;
  pingIntervalMs: number;
  logRequests: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.HOST,
    port: e.PORT,
    allowedOrigins: e.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: e.TRUST_PROXY === '1',
    pingIntervalMs: e.PING_INTERVAL_MS,
    logRequests: e.LOG_REQUESTS === '1'
  };
}

/* Posar en marxa les peces del servidor (també ho fan servir els tests i el servidor de desenvolupament). */
import { RateLimiter } from './auth/ratelimit.ts';
import type { Config } from './config.ts';
import { migrate, openDatabase, type Database } from './db/client.ts';
import { createApp } from './http/app.ts';
import { Hub } from './realtime/hub.ts';
import * as repo from './store/repo.ts';

export interface Runtime {
  database: Database;
  hub: Hub;
  loginLimiter: RateLimiter;
  app: ReturnType<typeof createApp>;
  close: () => Promise<void>;
}

export async function startRuntime(config: Config, opts: { now?: () => Date; watchMs?: number | null } = {}): Promise<Runtime> {
  const database = await openDatabase(config.databaseUrl);
  await migrate(database);
  await repo.ensureSeed(database.db);
  const now = opts.now ?? (() => new Date());
  const hub = new Hub(database.db, await repo.currentRev(database.db));
  if (opts.watchMs !== null) hub.watch(opts.watchMs ?? 3000);
  const loginLimiter = new RateLimiter(5, 60_000, () => now().getTime());
  const app = createApp({ db: database.db, hub, config, now, loginLimiter });
  return {
    database,
    hub,
    loginLimiter,
    app,
    close: async () => {
      hub.stop();
      await database.close();
    }
  };
}

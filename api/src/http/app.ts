/* L'aplicació HTTP: CORS per al wiki, límits de mida, errors en JSON i les rutes de /v1. */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { sql } from 'drizzle-orm';
import { ApiError } from '../errors.ts';
import type { AppEnv, Deps } from './context.ts';
import { adminRoutes } from './routes/admin.ts';
import { boardRoutes } from './routes/board.ts';
import { editRoutes } from './routes/edit.ts';
import { sessionRoutes } from './routes/session.ts';

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  const origins = deps.config.allowedOrigins;

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    const t0 = performance.now();
    await next();
    if (deps.config.logRequests && c.req.path !== '/healthz') {
      console.log(`${new Date().toISOString()} ${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - t0)}ms`);
    }
  });
  app.use(
    '/v1/*',
    cors({
      origin: (o) => (origins.includes('*') || origins.includes(o) ? o : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'If-Match', 'Last-Event-ID'],
      maxAge: 600
    })
  );
  app.use('/v1/import', bodyLimit({ maxSize: 5 * 1024 * 1024, onError: () => { throw new ApiError(413, 'too_large', 'El fitxer és massa gran'); } }));
  app.use('/v1/*', async (c, next) => {
    if (c.req.path === '/v1/import') return next();
    return bodyLimit({ maxSize: 256 * 1024, onError: () => { throw new ApiError(413, 'too_large', 'La petició és massa gran'); } })(c, next);
  });

  app.get('/healthz', async (c) => {
    try {
      await deps.db.execute(sql`select 1`);
      return c.json({ ok: true, streams: deps.hub.size });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  app.route('/v1', sessionRoutes);
  app.route('/v1', boardRoutes);
  app.route('/v1', editRoutes);
  app.route('/v1', adminRoutes);

  app.notFound(() => {
    throw new ApiError(404, 'not_found', 'Aquesta adreça no existeix');
  });
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Error intern del servidor' } }, 500);
  });
  return app;
}

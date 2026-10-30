/* Llegir: pobles, el tauler d'un poble (tot el que cal per pintar-lo en una sola petició), una missió i el canal
   d'esdeveniments en directe. Tot ja filtrat pel rol de la sessió. */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { TOWN_DEFS, TOWN_IDS, boardView, questView, type BoardEvent } from '@mina/model';
import { notFound } from '../../errors.ts';
import type { Conn } from '../../realtime/hub.ts';
import { assertTown } from '../../services/domain.ts';
import * as repo from '../../store/repo.ts';
import { authed, type AppEnv } from '../context.ts';

export const boardRoutes = new Hono<AppEnv>()
  .get('/towns', authed, (c) => c.json({ towns: TOWN_IDS.map((id) => ({ id, name: TOWN_DEFS[id].name })) }))
  .get('/boards/:town', authed, async (c) => {
    const town = assertTown(c.req.param('town'));
    const { db } = c.get('deps');
    /* llegir-ho tot dins d'una transacció: la revisió correspon exactament a les dades */
    const view = await db.transaction(async (tx) => boardView(c.get('session').role, await repo.loadAll(tx as never), town, await repo.currentRev(tx as never)));
    return c.json(view);
  })
  .get('/quests/:id', authed, async (c) => {
    const q = await repo.loadQuest(c.get('deps').db, c.req.param('id'));
    const view = q && questView(c.get('session').role, q);
    if (!view) throw notFound('quest');
    return c.json({ quest: view });
  })
  .get('/events', authed, async (c) => {
    const town = assertTown(c.req.query('town') || '');
    const { db, hub, config } = c.get('deps');
    const session = c.get('session');
    const header = c.req.header('last-event-id') ?? c.req.query('since');
    const since = header !== undefined && /^\d+$/.test(header) ? Number(header) : await repo.currentRev(db);
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      let closed = false;
      let finish: () => void = () => {};
      const done = new Promise<void>((r) => (finish = r));
      const conn: Conn = {
        sessionId: session.id,
        role: session.role,
        town,
        lastRev: since,
        replaying: false,
        send: async (rev: number, events: BoardEvent[]) => {
          if (closed) return;
          await stream.writeSSE({ event: 'change', id: String(rev), data: JSON.stringify({ rev, events }) });
        },
        close: () => {
          closed = true;
          finish();
        }
      };
      stream.onAbort(() => conn.close());
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ rev: since, role: session.role, town }), retry: 3000 });
      const ping = setInterval(() => {
        if (!closed) stream.write(': ping\n\n').catch(() => conn.close());
      }, config.pingIntervalMs);
      try {
        await hub.add(conn);
        await done;
      } finally {
        clearInterval(ping);
        hub.remove(conn);
      }
    });
  });

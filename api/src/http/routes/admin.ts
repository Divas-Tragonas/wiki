/* Còpies, importar i exportar, historial i desfer (només el DM). */
import { Hono } from 'hono';
import { SnapshotCreateBody } from '@mina/model';
import { ApiError } from '../../errors.ts';
import { listHistory, undo } from '../../services/history.ts';
import { createSnapshot, listSnapshots, restoreSnapshot } from '../../services/snapshots.ts';
import { exportAll, importMerge, importReplace } from '../../services/transfer.ts';
import { assertTown } from '../../services/domain.ts';
import { body, dmAuthed, rawJson, type AppEnv } from '../context.ts';

export const adminRoutes = new Hono<AppEnv>()
  .get('/export', dmAuthed, async (c) => {
    const data = await exportAll(c.get('deps').db);
    c.header('Content-Disposition', `attachment; filename="missions-${data.exportedAt.slice(0, 10)}.json"`);
    return c.json(data);
  })
  .post('/import', dmAuthed, async (c) => {
    const { db, hub, now } = c.get('deps');
    const s = c.get('session');
    const actor = { role: s.role, sessionId: s.id };
    const mode = c.req.query('mode');
    const input = await rawJson(c);
    if (mode === 'replace') {
      const r = await importReplace(db, actor, input, now());
      hub.poke().catch(() => {});
      return c.json({ rev: r.rev, ...r.result });
    }
    if (mode === 'merge') {
      const town = assertTown(c.req.query('town') || '');
      const r = await importMerge(db, actor, input, town, now());
      if (r.items.length) hub.poke().catch(() => {});
      return c.json({ rev: r.rev, ...r.result });
    }
    throw new ApiError(400, 'bad_mode', 'mode ha de ser replace o merge');
  })
  .get('/history', dmAuthed, async (c) => {
    const before = Number(c.req.query('before')) || null;
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 50));
    return c.json({ changes: await listHistory(c.get('deps').db, before, limit) });
  })
  .post('/history/:rev/undo', dmAuthed, async (c) => {
    const { db, hub, now } = c.get('deps');
    const s = c.get('session');
    const rev = Number(c.req.param('rev'));
    if (!Number.isInteger(rev)) throw new ApiError(400, 'bad_rev', 'Revisió no vàlida');
    const r = await undo(db, { role: s.role, sessionId: s.id }, rev, now());
    if (r.items.length) hub.poke().catch(() => {});
    return c.json({ rev: r.rev });
  })
  .get('/snapshots', dmAuthed, async (c) => c.json({ snapshots: await listSnapshots(c.get('deps').db) }))
  .post('/snapshots', dmAuthed, async (c) => {
    const b = await body(c, SnapshotCreateBody);
    return c.json(await createSnapshot(c.get('deps').db, 'manual', b.label || '', c.get('deps').now()), 201);
  })
  .post('/snapshots/:id/restore', dmAuthed, async (c) => {
    const { db, hub, now } = c.get('deps');
    const s = c.get('session');
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw new ApiError(400, 'bad_id', 'Còpia no vàlida');
    const r = await restoreSnapshot(db, { role: s.role, sessionId: s.id }, id, now());
    hub.poke().catch(() => {});
    return c.json({ rev: r.rev });
  });

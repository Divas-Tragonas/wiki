/* Entrar, sortir i dispositius. Una sessió de jugador es dona a qualsevol que la demani (el tauler no té contrasenya
   del grup); entrar amb la contrasenya del DM des d'una sessió de jugador hi afegeix el permís de DM (la mateixa clau)
   i «sortir del mode DM» el treu sense tancar la sessió. */
import { Hono } from 'hono';
import { LoginBody } from '@mina/model';
import { checkPassword, createSession, deleteSession, hasPassword, listSessions, resolveSession, setSessionRole } from '../../auth/sessions.ts';
import { ApiError, notFound } from '../../errors.ts';
import { authed, bearer, body, dmOnly, type AppEnv, type Ctx } from '../context.ts';

function clientIp(c: Ctx): string {
  if (c.get('deps').config.trustProxy) {
    const ip = c.req.header('cf-connecting-ip') || (c.req.header('x-forwarded-for') || '').split(',')[0].trim();
    if (ip) return ip;
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress || 'local';
}

export const sessionRoutes = new Hono<AppEnv>()
  .post('/session', async (c) => {
    const { db, now, loginLimiter } = c.get('deps');
    const b = await body(c, LoginBody);
    const label = (b.label || c.req.header('user-agent') || '').slice(0, 100);
    const token = bearer(c);
    const current = token ? await resolveSession(db, token, now()) : null;
    if (b.role === 'player') {
      /* sense contrasenya: qui ja té sessió la manté (amb el permís de DM, si en tenia) */
      if (current) return c.json({ role: current.role, id: current.id, token: null });
      const { token: fresh, session } = await createSession(db, 'player', label, now());
      return c.json({ role: session.role, id: session.id, token: fresh }, 201);
    }
    const ip = clientIp(c);
    const wait = loginLimiter.check(ip);
    if (wait) {
      c.header('Retry-After', String(wait));
      throw new ApiError(429, 'too_many_attempts', `Massa intents: torna-ho a provar d’aquí a ${wait} s`);
    }
    if (!(await hasPassword(db, b.role))) throw new ApiError(503, 'not_configured', 'Encara no s’ha posat aquesta contrasenya al servidor');
    loginLimiter.hit(ip);
    if (!(await checkPassword(db, b.role, b.password || ''))) throw new ApiError(401, 'wrong_password', 'Contrasenya incorrecta');
    loginLimiter.reset(ip);
    /* amb una sessió vàlida, la mateixa clau guanya el permís de DM */
    if (current) {
      await setSessionRole(db, current.id, 'dm', now());
      if (current.role !== 'dm') c.get('deps').hub.closeSession(current.id);
      return c.json({ role: 'dm', id: current.id, token: null });
    }
    const { token: fresh, session } = await createSession(db, 'dm', label, now());
    return c.json({ role: session.role, id: session.id, token: fresh }, 201);
  })
  .get('/session', authed, (c) => {
    const s = c.get('session');
    return c.json({ role: s.role, id: s.id, label: s.label });
  })
  .post('/session/player', authed, async (c) => {
    const s = c.get('session');
    if (s.role === 'dm') {
      await setSessionRole(c.get('deps').db, s.id, 'player', c.get('deps').now());
      c.get('deps').hub.closeSession(s.id);
    }
    return c.json({ role: 'player', id: s.id });
  })
  .delete('/session', authed, async (c) => {
    const s = c.get('session');
    await deleteSession(c.get('deps').db, s.id);
    c.get('deps').hub.closeSession(s.id);
    return c.body(null, 204);
  })
  .get('/sessions', authed, dmOnly, async (c) => {
    const me = c.get('session').id;
    const list = await listSessions(c.get('deps').db, c.get('deps').now());
    return c.json({ sessions: list.map((s) => ({ ...s, current: s.id === me })) });
  })
  .delete('/sessions/:id', authed, dmOnly, async (c) => {
    const id = c.req.param('id');
    if (!(await deleteSession(c.get('deps').db, id))) throw notFound('session');
    c.get('deps').hub.closeSession(id);
    return c.body(null, 204);
  });

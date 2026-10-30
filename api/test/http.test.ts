import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupEnv, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => { env = await setupEnv({ origins: 'https://wiki.example,http://localhost:4321' }); });
afterAll(async () => { await env.close(); });

describe('HTTP', () => {
  it('reports health without a session', async () => {
    const r = await env.req('GET', '/healthz');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, streams: 0 });
  });

  it('allows the wiki origins and no others', async () => {
    const pre = await env.rt.app.request('/v1/boards/phentanil', {
      method: 'OPTIONS',
      headers: { origin: 'https://wiki.example', 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'authorization,if-match,content-type' }
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://wiki.example');
    expect(pre.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('if-match');
    const bad = await env.rt.app.request('/v1/towns', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    const local = await env.rt.app.request('/v1/towns', { headers: { origin: 'http://localhost:4321' } });
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:4321');
  });

  it('answers unknown routes with a JSON 404', async () => {
    const r = await env.req('GET', '/v1/nothing-here');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
  });

  it('explains invalid bodies', async () => {
    const dm = await env.login('dm');
    const r = await env.req('PATCH', '/v1/party', { token: dm, body: { level: 'high' } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('invalid_body');
    expect(r.body.error.details[0].path).toEqual(['level']);
    expect((await env.req('PATCH', '/v1/party', { token: dm, raw: '{' })).body.error.code).toBe('bad_json');
  });
});

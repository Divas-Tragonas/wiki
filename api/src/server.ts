/* Servidor de producció (a la Mac mini el posa en marxa launchd). */
import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { startRuntime } from './runtime.ts';

const config = loadConfig();
const rt = await startRuntime(config);
const server = serve({ fetch: rt.app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`missions-api escoltant a http://${info.address}:${info.port} (${rt.database.kind})`);
});

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: aturant`);
  rt.hub.closeAll();
  server.close();
  await rt.close();
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));

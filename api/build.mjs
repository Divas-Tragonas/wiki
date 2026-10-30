/* Build de producció: server.js i cli.js amb @mina/model inclòs (és codi TypeScript del repositori); la resta de
   paquets queden a node_modules. Les migracions es copien al costat. */
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/server.ts', 'src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externals',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith('@mina/') ? undefined : { path: args.path, external: true }));
      }
    }
  ]
});
cpSync('src/db/migrations', 'dist/migrations', { recursive: true });

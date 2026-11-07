/* Tasques d'administració a la Mac mini: `npm run cli -w api -- <ordre>` (o `node dist/cli.js <ordre>`).
   Els canvis que fa la CLI arriben als taulers connectats: el servidor mira la revisió cada pocs segons. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { lt } from 'drizzle-orm';
import type { Role } from '@mina/model';
import { hashPassword } from './auth/passwords.ts';
import { hasPassword, listSessions, pruneSessions, setPasswordHash } from './auth/sessions.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, type Database } from './db/client.ts';
import { changes } from './db/schema.ts';
import { createSnapshot, pruneSnapshots } from './services/snapshots.ts';
import { fromLegacy, type CampaignData } from '@mina/model';
import { decryptLegacyDataJson, exportAll, importReplace } from './services/transfer.ts';
import * as repo from './store/repo.ts';

const CLI = { role: 'dm' as Role, sessionId: null };

/* què hi ha en unes dades (per comparar el fitxer amb la base de dades) */
function summary(d: CampaignData): string {
  const q = d.quests;
  const towns = Object.entries(d.boards).map(([t, b]) => `${t}: ${q.filter((x) => t in x.towns).length} missions, ${Object.keys(b.layout).length} peces col·locades, ${Object.keys(b.places).length} textos de llocs`);
  return [
    `Missions: ${q.length} (${q.filter((x) => x.hidden).length} ocultes, ${q.filter((x) => x.status === 'done').length} completades, ${q.reduce((n, x) => n + x.steps.length, 0)} objectius)`,
    `Ecos: ${d.ecos.length} (${d.ecos.filter((e) => e.unlocked).length} recuperats)`,
    `Seguida: ${d.tracked ?? 'cap'}`,
    ...towns
  ].join('\n');
}
const HISTORY_DAYS = 90;

const HELP = `Ordres:
  migrate                       aplica les migracions pendents
  status                        revisió, missions, contrasenya del DM i sessions
  set-password dm               demana la contrasenya nova del DM (o PASSWORD=…); treu el permís de DM a tothom
  import <fitxer.json>          carrega una còpia exportada a la base de dades
  import-data-json <data.json>  carrega el data.json xifrat d'abans (demana la contrasenya del DM, o DM_PASSWORD=…)
      --dry-run                 només diu què hi ha al fitxer, sense tocar la base de dades
      --force                   substitueix el que ja hi hagi (sense, si ja hi ha missions, no fa res)
  export [fitxer.json]          exporta-ho tot (sense fitxer, a la sortida)
  snapshot [etiqueta]           còpia manual dins de la base de dades
  nightly                       còpia de la nit i neteja (còpies velles, historial de més de ${HISTORY_DAYS} dies, sessions caducades)`;

function ask(question: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      out._writeToOutput = (s: string) => {
        if (s.includes(question)) out.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function withDb<T>(fn: (d: Database) => Promise<T>): Promise<T> {
  const database = await openDatabase(loadConfig().databaseUrl);
  try {
    await migrate(database);
    await repo.ensureSeed(database.db);
    return await fn(database);
  } finally {
    await database.close();
  }
}

async function main(argv: string[]) {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case 'migrate':
      return withDb(async () => console.log('Migracions aplicades.'));
    case 'status':
      return withDb(async ({ db, kind }) => {
        const data = await repo.loadAll(db);
        console.log(`Base de dades: ${kind}`);
        console.log(`Revisió: ${await repo.currentRev(db)}`);
        console.log(`Missions: ${data.quests.length} (${data.quests.filter((q) => q.hidden).length} ocultes, ${data.quests.filter((q) => q.status === 'done').length} completades)`);
        console.log(`Ecos: ${data.ecos.length}`);
        console.log(`Contrasenya dm: ${(await hasPassword(db, 'dm')) ? 'posada' : 'FALTA'}`);
        console.log(`Sessions: ${(await listSessions(db, new Date())).length}`);
      });
    case 'set-password': {
      /* el tauler ja no té contrasenya del grup: només hi ha la del DM */
      if (args[0] !== 'dm') throw new Error('Només hi ha la contrasenya del DM: set-password dm (el tauler s’obre sense contrasenya)');
      const pw = process.env.PASSWORD || (await ask('Contrasenya nova del DM: ', true));
      if (pw.trim().length < 4) throw new Error('La contrasenya ha de tenir com a mínim 4 caràcters');
      return withDb(async ({ db }) => {
        await setPasswordHash(db, 'dm', await hashPassword(pw), new Date());
        console.log('Contrasenya del DM canviada. Ningú no té el permís de DM fins que hi torni a entrar.');
      });
    }
    case 'import':
    case 'import-data-json': {
      const file = args.find((a) => !a.startsWith('--'));
      const dryRun = args.includes('--dry-run'), force = args.includes('--force');
      if (!file) throw new Error('Cal el fitxer');
      let input: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (cmd === 'import-data-json') {
        const pw = process.env.DM_PASSWORD || (await ask('Contrasenya del DM del data.json: ', true));
        input = await decryptLegacyDataJson(input, pw);
      }
      if (!input || typeof input !== 'object' || !Array.isArray((input as { quests?: unknown }).quests)) throw new Error('Aquest fitxer no és un tauler de missions');
      const { data, skipped } = fromLegacy(input);
      console.log('Al fitxer:\n' + summary(data));
      if (skipped.length) console.log(`Es descartaran (id no vàlid o repetit): ${skipped.join(', ')}`);
      if (dryRun) {
        console.log('(--dry-run: no s’ha tocat la base de dades)');
        return;
      }
      return withDb(async ({ db }) => {
        const current = await repo.loadAll(db);
        if ((current.quests.length || current.ecos.length) && !force) {
          throw new Error(`La base de dades ja té ${current.quests.length} missions i ${current.ecos.length} ecos: no s’ha importat res. Amb --force se substitueixen (abans se’n fa una còpia).`);
        }
        const r = await importReplace(db, CLI, input);
        console.log(`Importat (revisió ${r.rev}). A la base de dades:\n` + summary(await repo.loadAll(db)));
      });
    }
    case 'export':
      return withDb(async ({ db }) => {
        const json = JSON.stringify(await exportAll(db), null, 1);
        if (args[0]) {
          writeFileSync(args[0], json);
          console.log(`Exportat a ${args[0]}`);
        } else process.stdout.write(json + '\n');
      });
    case 'snapshot':
      return withDb(async ({ db }) => {
        const s = await createSnapshot(db, 'manual', args.join(' '));
        console.log(`Còpia ${s.id} (revisió ${s.rev}).`);
      });
    case 'nightly':
      return withDb(async ({ db }) => {
        const s = await createSnapshot(db, 'nightly');
        const dropped = await pruneSnapshots(db, 30);
        const cutoff = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
        const old = await db.delete(changes).where(lt(changes.at, cutoff)).returning({ rev: changes.rev });
        const sessions = await pruneSessions(db, new Date());
        console.log(`Còpia ${s.id}. Esborrades: ${dropped} còpies velles, ${old.length} canvis de l’historial, ${sessions} sessions caducades.`);
      });
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

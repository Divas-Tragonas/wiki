/* Tasques d'administració a la Mac mini: `npm run cli -w api -- <ordre>` (o `node dist/cli.js <ordre>`).
   Els canvis que fa la CLI arriben als taulers connectats: el servidor mira la revisió cada pocs segons. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { lt } from 'drizzle-orm';
import { ROLES, type Role } from '@mina/model';
import { hashPassword } from './auth/passwords.ts';
import { hasPassword, listSessions, pruneSessions, setPasswordHash } from './auth/sessions.ts';
import { loadConfig } from './config.ts';
import { migrate, openDatabase, type Database } from './db/client.ts';
import { changes } from './db/schema.ts';
import { createSnapshot, pruneSnapshots } from './services/snapshots.ts';
import { decryptLegacyDataJson, exportAll, importReplace } from './services/transfer.ts';
import * as repo from './store/repo.ts';

const CLI = { role: 'dm' as Role, sessionId: null };
const HISTORY_DAYS = 90;

const HELP = `Ordres:
  migrate                       aplica les migracions pendents
  status                        revisió, missions, contrasenyes i sessions
  set-password <player|dm>      demana la contrasenya nova (o PASSWORD=…); tanca les sessions afectades
  import <fitxer.json>          substitueix-ho tot per una còpia exportada (en fa una còpia abans)
  import-data-json <data.json>  importa el data.json xifrat d'abans (demana la contrasenya del DM, o DM_PASSWORD=…)
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
        for (const r of ROLES) console.log(`Contrasenya ${r}: ${(await hasPassword(db, r)) ? 'posada' : 'FALTA'}`);
        console.log(`Sessions: ${(await listSessions(db, new Date())).length}`);
      });
    case 'set-password': {
      const role = args[0] as Role;
      if (!ROLES.includes(role)) throw new Error('Cal dir quina: set-password player o set-password dm');
      const pw = process.env.PASSWORD || (await ask(`Contrasenya nova (${role}): `, true));
      if (pw.trim().length < 4) throw new Error('La contrasenya ha de tenir com a mínim 4 caràcters');
      return withDb(async ({ db }) => {
        await setPasswordHash(db, role, await hashPassword(pw), new Date());
        console.log(role === 'player' ? 'Contrasenya del grup canviada. Totes les sessions s’han tancat.' : 'Contrasenya del DM canviada. Ningú no té el permís de DM fins que hi torni a entrar.');
      });
    }
    case 'import':
    case 'import-data-json': {
      if (!args[0]) throw new Error('Cal el fitxer');
      let input: unknown = JSON.parse(readFileSync(args[0], 'utf8'));
      if (cmd === 'import-data-json') {
        const pw = process.env.DM_PASSWORD || (await ask('Contrasenya del DM del data.json: ', true));
        input = await decryptLegacyDataJson(input, pw);
      }
      return withDb(async ({ db }) => {
        const r = await importReplace(db, CLI, input);
        console.log(`Importat: ${r.result.quests} missions, ${r.result.ecos} ecos (revisió ${r.rev}).`);
        if (r.result.skipped.length) console.log(`Descartades (id no vàlid o repetit): ${r.result.skipped.join(', ')}`);
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

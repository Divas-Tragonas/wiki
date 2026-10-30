# API de missions a la Mac mini

L'API del tauler de missions (`api/`) corre a la Mac mini com un servei de launchd, amb Postgres. Es manté al dia sola:
l'autofetch de la Mac mini actualitza el repositori i `update.sh` posa en marxa la versió nova quan `api/` o
`packages/` han canviat.

```
~/missions-api/
├── .env                 configuració (a partir de env.example; no va al repositori)
├── current -> releases/<commit>   la versió en marxa
├── releases/<commit>/   cada versió construïda (es queden les 5 últimes)
├── deployed             el commit en marxa · failed: l'últim que ha fallat (no es reintenta)
├── backups/             còpies de cada nit (JSON i pg_dump, 30 dies)
└── logs/                api.log, update.log, backup.log, preflight.log
```

## Posada en marxa

Cal Node 22 (o més nou), Postgres (14 o més nou) i el repositori clonat (és públic: n'hi ha prou amb https).

1. **Base de dades**: un usuari i una base de dades propis.
   ```bash
   createuser missions --pwprompt
   createdb missions --owner missions
   ```
2. **Configuració**: `mkdir -p ~/missions-api && cp deploy/macmini/env.example ~/missions-api/.env`, i omplir
   `DATABASE_URL` i `ALLOWED_ORIGINS` (l'adreça del wiki). `chmod 600 ~/missions-api/.env`.
3. **Servei**: copiar `missions-api.plist` a `~/Library/LaunchAgents/cat.divasytragonas.missions-api.plist`, substituint
   `__HOME__` (el directori de l'usuari) i `__NODE_DIR__` (la carpeta on és `node`, p. ex. `/opt/homebrew/bin`), i
   `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cat.divasytragonas.missions-api.plist`.
   (Si a la Mac mini els serveis van com a LaunchDaemons o amb un altre gestor, cal fer el mateix allà i posar l'ordre de
   reinici a `RESTART_CMD`.)
4. **Primera versió**: `deploy/macmini/update.sh` (construeix, passa els tests, migra, prova i engega). Comprovar:
   `curl http://127.0.0.1:8787/healthz` → `{"ok":true,…}`.
5. **Contrasenyes** (noves: les d'abans estan, xifrades, a l'historial públic del repositori):
   ```bash
   cd ~/missions-api/current && set -a && . ~/missions-api/.env && set +a
   node api/dist/cli.js set-password player
   node api/dist/cli.js set-password dm
   ```
6. **Les missions d'abans**: abans, el DM ha de publicar des del tauler vell els canvis que tingui pendents. Després:
   ```bash
   node api/dist/cli.js import-data-json <repositori>/public/missions/data.json   # demana la contrasenya del DM d'abans
   node api/dist/cli.js status
   ```
7. **Actualitzacions**: subscriure el repositori a l'autofetch i fer que, després de cada actualització, s'executi
   `deploy/macmini/update.sh` (amb el registre a `~/missions-api/logs/update.log`). Si l'autofetch no pot executar res
   després d'actualitzar, `missions-update.plist` el crida cada 5 minuts (no fa res si no hi ha res de nou).
8. **Còpies de cada nit**: `missions-nightly.plist` (a les 4:17). Amb `RCLONE_REMOTE` al `.env`, també fora de la Mac mini.
9. **Accés des de fora**: el servei només escolta a `127.0.0.1`. Per publicar-lo cal un túnel (Cloudflare Tunnel cap a
   `http://127.0.0.1:8787`, o el mecanisme que ja facin servir les altres APIs de la Mac mini) amb HTTPS. Amb
   Cloudflare, posar `TRUST_PROXY=1` al `.env`. L'adreça pública va a la variable `MISSIONS_API_URL` del repositori de
   GitHub (i a `PUBLIC_MISSIONS_API_URL` de Vercel).

La Mac mini ha d'estar configurada per no adormir-se i per arrencar sola després d'un tall de llum.

## Ordres de la CLI

Des de `~/missions-api/current`, amb el `.env` carregat (`set -a; . ~/missions-api/.env; set +a`):

| Ordre | Què fa |
| :-- | :-- |
| `node api/dist/cli.js status` | revisió, missions, contrasenyes i sessions |
| `node api/dist/cli.js set-password player\|dm` | contrasenya nova; tanca les sessions afectades |
| `node api/dist/cli.js import <fitxer.json>` | substitueix-ho tot per una exportació (en fa una còpia abans) |
| `node api/dist/cli.js import-data-json <data.json>` | importa el `data.json` xifrat d'abans |
| `node api/dist/cli.js export [fitxer.json]` | exporta-ho tot |
| `node api/dist/cli.js snapshot [etiqueta]` | còpia dins de la base de dades |
| `node api/dist/cli.js nightly` | còpia de la nit i neteja (ho fa `backup.sh`) |

## Si alguna cosa va malament

- **Una versió nova no arrenca**: `update.sh` la prova en un altre port abans de canviar i, si falla, es queda amb la que
  hi havia (`logs/update.log`, `logs/preflight.log`). No la torna a provar fins que hi hagi un commit nou; per forçar-ho,
  `FORCE=1 deploy/macmini/update.sh`.
- **Tornar a una versió anterior a mà**: `ln -sfn ~/missions-api/releases/<commit> ~/missions-api/current` i
  `launchctl kickstart -k gui/$(id -u)/cat.divasytragonas.missions-api`.
- **Recuperar dades**: des del tauler (Historial → Còpies → Restaurar), amb `cli.js import backups/missions-<data>.json`,
  o amb `pg_restore` del `.dump`.

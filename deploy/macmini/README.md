# API de missions a la Mac mini (Ubuntu Server)

L'API del tauler de missions (`api/`) corre a la Mac mini (Ubuntu Server 24.04) com un servei de systemd, amb
Postgres, sota un usuari de sistema propi (`missions`). Es manté al dia sola: l'autofetch actualitza el clon del
repositori i `update.sh` posa en marxa la versió nova quan `api/` o `packages/` han canviat.

```
/opt/missions-api/                (propietari: missions)
├── .env                          configuració (a partir de env.example, mode 600; no va al repositori)
├── current -> releases/<commit>  la versió en marxa
├── releases/<commit>/            cada versió construïda (es queden les 5 últimes)
├── deployed                      el commit en marxa · failed: l'últim que ha fallat (no es reintenta)
├── backups/                      còpies de cada nit (JSON i pg_dump, 30 dies)
└── logs/                         preflight.log (la resta, al journal)
```

| Fitxer | Què és |
| :-- | :-- |
| `update.sh` | construeix, prova i posa en marxa la versió nova (no fa res si no n'hi ha) |
| `backup.sh` | còpia de cada nit |
| `missions-api.service` | el servei de l'API |
| `missions-backup.service` + `.timer` | la còpia, cada nit a les 4:17 |
| `missions-update.service` + `.timer` | crida `update.sh` cada 5 minuts (només si l'autofetch no el pot cridar ell) |
| `missions-api.sudoers` | deixa que `missions` reiniciï el servei, i res més |
| `env.example` | plantilla del `.env` |

## Posada en marxa

Cal Node 22 (de NodeSource, a `/usr/bin/node`), Postgres (el d'Ubuntu 24.04 és el 16) i el clon del repositori
(és públic: n'hi ha prou amb https) llegible per a l'usuari `missions`.

1. **Usuari**: `useradd --system --home-dir /opt/missions-api --create-home --shell /usr/sbin/nologin missions`.
2. **Base de dades**:
   ```bash
   sudo -u postgres createuser missions --pwprompt
   sudo -u postgres createdb missions --owner missions
   ```
3. **Configuració**: `install -o missions -g missions -m 600 deploy/macmini/env.example /opt/missions-api/.env` i
   omplir `DATABASE_URL` (amb la contrasenya de l'usuari de Postgres) i `ALLOWED_ORIGINS` (l'adreça del wiki).
4. **Servei i permisos**:
   ```bash
   install -m 0440 deploy/macmini/missions-api.sudoers /etc/sudoers.d/missions-api && visudo -c
   cp deploy/macmini/missions-api.service /etc/systemd/system/ && systemctl daemon-reload
   ```
5. **Primera versió** (construeix, passa els tests, migra, prova en un altre port i engega):
   ```bash
   sudo -u missions deploy/macmini/update.sh
   systemctl enable missions-api    # update.sh ja l'ha engegat; així també arrenca en reiniciar
   curl http://127.0.0.1:8787/healthz   # {"ok":true,…}
   ```
6. **Contrasenya del DM** (el tauler s'obre sense contrasenya; només el mode DM en demana). Totes les ordres de la CLI
   es fan així, com a `missions` i amb el `.env` carregat:
   ```bash
   cli() { sudo -u missions bash -c 'set -a; . /opt/missions-api/.env; set +a; cd /opt/missions-api/current && node api/dist/cli.js "$@"' cli "$@"; }
   cli set-password dm
   ```
7. **Les missions d'abans**: no es van poder importar (ningú recorda la contrasenya del DM del tauler vell) i
   `public/missions/data.json` ja no és al repositori. Si mai apareix la contrasenya, el fitxer es recupera de
   l'historial i es carrega així:
   ```bash
   git -C <clon> show 7ef678c:public/missions/data.json > /tmp/data.json
   cli import-data-json /tmp/data.json --dry-run   # diu què hi ha, sense tocar res
   cli import-data-json /tmp/data.json             # el carrega (si la base de dades és buida)
   cli status
   ```
   Si la base de dades ja té missions no fa res (perquè no es perdi feina feta al tauler nou); `--force` les
   substitueix, i abans en fa una còpia.
8. **Actualitzacions**: subscriure el clon a l'autofetch i fer que, després de cada actualització, executi
   `sudo -u missions <clon>/deploy/macmini/update.sh`. Si l'autofetch no pot executar res després d'actualitzar,
   `missions-update.service` + `.timer` (substituint `__REPO__` pel camí del clon) el criden cada 5 minuts.
9. **Còpies de cada nit**: `missions-backup.service` + `.timer` (substituint `__REPO__`). Amb `RCLONE_REMOTE` al `.env`,
   també fora de la màquina.
10. **Accés des de fora**: el servei només escolta a `127.0.0.1:8787`. Amb Tailscale Funnel:
    `tailscale funnel --bg 8787` (l'API queda a `https://<màquina>.<tailnet>.ts.net`, i es manté després de reiniciar).
    Amb Funnel, `TRUST_PROXY=0`. L'adreça pública va a la variable `MISSIONS_API_URL` del repositori de GitHub (i a
    `PUBLIC_MISSIONS_API_URL` de Vercel), i l'origen del wiki a `ALLOWED_ORIGINS`.

## Frases del cercador

Els vídeos de YouTube per al cercador de frases del wiki es transcriuen des d'aquí, perquè YouTube bloqueja els
servidors de GitHub: vegeu [`FRASES.md`](FRASES.md), que té un prompt per donar-li a Claude Code. Es fa en un clon
a part (`~/wiki-frases`), no en el de l'autofetch.

## Ordres de la CLI

Amb la funció `cli` del pas 6:

| Ordre | Què fa |
| :-- | :-- |
| `cli status` | revisió, missions, contrasenya del DM i sessions |
| `cli set-password dm` | contrasenya nova del DM; treu el permís de DM a tothom |
| `cli import <fitxer.json> [--dry-run] [--force]` | carrega una exportació (la de «Exportar» del tauler) |
| `cli import-data-json <data.json> [--dry-run] [--force]` | carrega el `data.json` xifrat d'abans |
| `cli export [fitxer.json]` | exporta-ho tot |
| `cli snapshot [etiqueta]` | còpia dins de la base de dades |
| `cli nightly` | còpia de la nit i neteja (ho fa `backup.sh`) |

## Si alguna cosa va malament

- **Registre**: `journalctl -u missions-api` (l'API), `journalctl -u missions-update -u missions-backup`.
- **Una versió nova no arrenca**: `update.sh` la prova en un altre port abans de canviar i, si falla, es queda amb la que
  hi havia (`logs/preflight.log`). No la torna a provar fins que hi hagi un commit nou; per forçar-ho,
  `sudo -u missions FORCE=1 <clon>/deploy/macmini/update.sh`.
- **Tornar a una versió anterior a mà**: `sudo -u missions ln -sfn /opt/missions-api/releases/<commit> /opt/missions-api/current`
  i `systemctl restart missions-api`.
- **Recuperar dades**: des del tauler (Historial → Còpies → Restaurar), amb `cli import backups/missions-<data>.json --force`,
  o amb `pg_restore` del `.dump`.

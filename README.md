# La Mina Perduda del Phentanilo

🌐 **Wiki:** https://divas-tragonas.github.io/wiki

Wiki de la campanya de D&D 5e: personatges, llocs, cròniques de cada sessió i el tauler de missions del grup.
Feta amb [Astro](https://astro.build) i publicada a GitHub Pages.

## Comandes

Cal Node 22 (vegeu `.nvmrc`). El repositori té tres espais de treball d'npm: el wiki (l'arrel), `api/` i `packages/model/`.

| Comanda                      | Què fa                                                          |
| :--------------------------- | :-------------------------------------------------------------- |
| `npm install`                | Instal·la les dependències de tot                               |
| `npm run dev`                | Wiki a `localhost:4321/wiki`                                    |
| `npm run dev -w @mina/api`   | API de missions a `localhost:8787` (sense Postgres: PGlite)     |
| `npm run check`              | Comprova els tipus del wiki, l'API i el model                   |
| `npm test`                   | Tests del model i de l'API                                      |
| `npm run test:e2e`           | Proves de punta a punta del tauler (Playwright)                 |
| `npm run build`              | Construeix el lloc a `dist/`                                    |

## On és cada cosa

- `src/content/` — el contingut en Markdown: `characters/`, `places/` i `croniques/`.
- `src/pages/`, `src/layouts/`, `src/components/` — les pàgines del wiki.
- `src/lib/` — rutes, etiquetes en català, format de dates i dates de l'últim canvi.
- `src/pages/missions/` i `src/missions/` — el tauler de missions.
- `api/` — l'API de missions (Hono + Postgres), que corre a la Mac mini.
- `packages/model/` — les dades del tauler compartides per l'API i el tauler.
- `deploy/macmini/` — posada en marxa i actualització automàtica de l'API.
- `e2e/` — proves de punta a punta del tauler.
- `transcripts/` — transcripcions de les sessions, d'on surten les cròniques.
- `scripts/nova-sessio/` i `.github/workflows/nova-sessio.yml` — la sessió nova automàtica (vegeu més avall).

## Després de cada partida

No cal fer res. Si el vídeo és a Twitch amb «SESSIÓ N» al títol, l'endemà arriba un **PR «Sessió N: …»** amb la
transcripció, la crònica i els canvis a les fitxes. Llegeix els dubtes de la descripció, corregeix el que calgui
(comentant «@claude …» o editant) i fes **Merge**. Per a YouTube o un vídeo concret: **New issue → «🎲 Sessió nova»**.
Els detalls i els secrets que calen són a la secció «Sessió nova» del [`CLAUDE.md`](CLAUDE.md).

Cada push a `master` republica el wiki (`.github/workflows/deploy.yml`) i la Mac mini actualitza l'API sola. Les
instruccions per afegir contingut i els detalls del tauler de missions són a [`CLAUDE.md`](CLAUDE.md).

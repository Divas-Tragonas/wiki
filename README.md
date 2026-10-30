# La Mina Perduda del Phentanilo

🌐 **Wiki:** https://divas-tragonas.github.io/wiki

Wiki de la campanya de D&D 5e: personatges, llocs, cròniques de cada sessió i el tauler de missions del grup.
Feta amb [Astro](https://astro.build) i publicada a GitHub Pages.

## Comandes

Cal Node 22 (vegeu `.nvmrc`).

| Comanda           | Què fa                                                  |
| :---------------- | :------------------------------------------------------ |
| `npm install`     | Instal·la les dependències                              |
| `npm run dev`     | Servidor de desenvolupament a `localhost:4321/wiki`     |
| `npm run check`   | Comprova els tipus i el contingut                       |
| `npm run build`   | Construeix el lloc a `dist/`                            |
| `npm run preview` | Previsualitza el lloc construït                         |

## On és cada cosa

- `src/content/` — el contingut en Markdown: `characters/`, `places/` i `croniques/`.
- `src/pages/`, `src/layouts/`, `src/components/` — les pàgines del wiki.
- `src/lib/` — rutes, etiquetes en català, format de dates i dates de l'últim canvi.
- `src/pages/missions/` i `src/missions/` — el tauler de missions (pàgina a pantalla completa, sense el layout del wiki).
- `public/missions/data.json` — les missions, xifrades; el tauler les hi desa des del mode DM.
- `transcripts/` — transcripcions de les sessions, d'on surten les cròniques.

Cada push a `master` republica el lloc (`.github/workflows/deploy.yml`). Les instruccions per afegir
contingut i els detalls del tauler de missions són a [`CLAUDE.md`](CLAUDE.md).

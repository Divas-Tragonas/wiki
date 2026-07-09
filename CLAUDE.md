# Wiki — La Mina Perduda del Phentanilo

Wiki de campanya D&D 5e construïda amb **Astro 6 + Tailwind CSS 4**. Totes les pàgines es generen estàticament a partir de fitxers Markdown.

## Comandes principals

```bash
nvm use          # Node 22 requerit (vegeu .nvmrc)
npm run dev      # servidor de desenvolupament a localhost:4321
npm run build    # genera el lloc a /dist
npm run preview  # previsualitza el build final
```

## Estructura del projecte

```
src/
├── content/             # tot el contingut editable
│   ├── characters/      # fitxers .md de PNJs, enemics i faccions
│   ├── places/          # fitxers .md dels llocs del món
│   └── croniques/       # fitxers .md de cada sessió
├── content.config.ts    # esquema dels camps de cada col·lecció
├── pages/               # rutes del lloc (no cal tocar-les normalment)
├── layouts/             # BaseLayout i EntryLayout
└── components/          # Navbar, Card, TagBadge, Footer
```

La col·lecció `characters` inclou PNJs, enemics, faccions **i els personatges jugadors del grup**. Els PCs es guarden amb informació mínima (només frontmatter identificatiu: `pc: true`, `player`, `race`, `pcClass`, `level`) perquè cada jugador conserva la seva fitxa detallada fora d'aquesta wiki i el grup manté una imatge pròpia de cada company. No hi afegeixis biografies, trasfons ni "moments destacats" —la wiki és un registre narratiu, no una fitxa de personatge.

## Afegir contingut nou

### Personatge nou (PNJ, enemic o facció)

Crea `src/content/characters/nom-del-personatge.md`:

```markdown
---
name: "Nom Complet"
description: "Una frase de descripció curta."
role: "Aliat"        # opcional, per a PNJs (p. ex. "Aliat", "Funcionari")
type: "humanoid"     # opcional, per a enemics: creature | humanoid | faction | undead | fiend | other
cr: "5"              # opcional, només per a enemics
status: "unknown"    # ally | neutral | active | defeated | unknown
tags: ["tag1", "tag2"]
image: "/images/nom.jpg"  # opcional
---

Contingut lliure en Markdown...
```

### Lloc nou

Crea `src/content/places/nom-del-lloc.md`:

```markdown
---
name: "Nom del Lloc"
type: "city"        # city | dungeon | forest | ruin | region | other
description: "Una frase de descripció curta."
tags: ["tag1"]
---

Contingut lliure en Markdown...
```

### Crònica de sessió nova

Crea `src/content/croniques/sessio-N.md`:

```markdown
---
title: "Títol de la Sessió"
session: 4
date: 2026-06-21
summary: "Resum d'una frase per a les llistes."
players: ["Anna", "Marc", "Sara", "Pau"]
tags: ["tag1", "tag2"]
---

Contingut lliure en Markdown...
```

## Desplegament a GitHub Pages

El workflow `.github/workflows/deploy.yml` es dispara automàticament en cada push a `master`. El lloc es publica a `https://divas-tragonas.github.io/wiki`.

Per activar-ho per primera vegada al repo de GitHub: **Settings → Pages → Source → GitHub Actions**.

## Notes tècniques

- El `base` del lloc és `/wiki` (configurat a `astro.config.mjs`). Els links interns han d'usar `import.meta.env.BASE_URL` com a prefix.
- Els noms de fitxer dels `.md` es converteixen en la URL (p. ex. `lyra-solaris.md` → `/wiki/characters/lyra-solaris`).
- Si s'afegeix un camp nou als frontmatters, cal actualitzar l'esquema a `src/content.config.ts`.

# Wiki — La Mina Perduda del Phentanilo

Wiki de campanya D&D 5e construïda amb **Astro 6 + Tailwind CSS 4**. Totes les pàgines es generen estàticament a partir de fitxers Markdown.

## Comandes principals

```bash
nvm use          # Node 22 requerit (vegeu .nvmrc)
npm run dev      # servidor de desenvolupament a localhost:4321/wiki
npm run check    # comprova tipus i contingut (també es fa al workflow abans del build)
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
├── layouts/             # BaseLayout i EntryLayout (fitxa amb columna lateral)
├── components/          # Navbar, Footer, SearchModal, Card, TagBadge, Breadcrumb, PageHeader, SectionHeader
├── lib/
│   ├── site.ts          # rutes (`url`, `routes`), etiquetes en català, format de dates i ordenació
│   └── git.ts           # data de l'últim commit de cada fitxer (per als «Últims canvis» de la portada)
└── styles/global.css    # colors i fonts (`@theme`), `.page`, `.cards-grid` i estils del Markdown
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

- El `base` del lloc és `/wiki` (configurat a `astro.config.mjs`). Els links interns es fan amb `routes` o `url()` de `src/lib/site.ts`, que hi afegeixen el prefix.
- Els noms de fitxer dels `.md` es converteixen en la URL (p. ex. `lyra-solaris.md` → `/wiki/wiki/characters/lyra-solaris`: el primer `wiki` és el `base` i el segon la secció).
- Si s'afegeix un camp nou als frontmatters, cal actualitzar l'esquema a `src/content.config.ts`. Si és un valor nou d'un `enum` (`status`, `type`), també cal la seva etiqueta en català a `src/lib/site.ts` (el `npm run check` avisa si falta).
- Els colors són variables de `src/styles/global.css` (`var(--color-gold-500)`, `var(--color-stone-700)`…): als estils dels components no s'hi posen colors a mà.
- Els «Últims canvis» de la portada surten de l'historial de git; per això el workflow fa el checkout amb `fetch-depth: 0`.
- El cercador és un modal global (`src/components/SearchModal.astro`, obert des del botó de la Navbar o amb Ctrl+K); l'índex JSON es genera al build a `src/pages/cerca.json.ts` a partir de les col·leccions, així que el contingut nou s'hi indexa sol.

## Tauler de missions (`public/missions/`)

Pàgina estàtica independent d'Astro (no usa el layout ni Tailwind, ni cap pas de build): `index.html`, `app.css`, `js/` i `assets/`. Es publica a `/wiki/missions/` i s'enllaça des de la Navbar.

El codi són mòduls ES sense dependències (GSAP es carrega a part, `assets/gsap.min.js`, i si no hi és les peces van directament al seu lloc):

- `js/main.js`: l'aplicació (arrencada, papers, zoom, mapa, moure papers, mode DM, publicar i entrada de teclat, ratolí i comandament).
- `js/towns.js`: els pobles (`TOWNS`) amb els noms del mapa (`GEOM_PHENTANIL`, `GEOM_CONY`) i els textos dels llocs.
- `js/layout.js`: geometria del tauler (llocs dels papers, textures, escales).
- `js/data.js`: l'estat de les missions (`normState`, que també migra dades antigues) i la part pública (`publicView`).
- `js/light.js`: la llum (ombra d'arbres) i el WebGL de la llum viva.
- `js/crypto.js`, `js/github.js`, `js/gate.js`, `js/ui.js`, `js/tween.js`, `js/util.js`: xifratge, publicació a GitHub, la porta de les contrasenyes, escenari i avisos, GSAP i utilitats.

- Les dades són a `public/missions/data.json`, **xifrades** (AES-GCM amb clau PBKDF2): `pub` és el que veu el grup (contrasenya del grup) i `dm` és l'estat complet amb missions ocultes i notes (contrasenya del DM). Les contrasenyes no són enlloc del repositori. No editis aquest fitxer a mà.
- Les missions s'editen des del mateix tauler en **mode DM** (botó «Mode DM» o tecla D). «Publicar al wiki» desa `data.json` a `master` amb l'API de GitHub (cal una clau d'accés amb permís d'escriptura al repositori, que es guarda només al navegador del DM) i el workflow de Pages republica el lloc.
- Hi ha un tauler per poble: Phentanil a `/wiki/missions/` i Cony Cirera a `/wiki/missions/?lloc=cony-cirera`, amb botons a la part de dalt per passar d'un a l'altre. Cada poble es configura a `TOWNS` (`js/towns.js`). Totes les missions viuen al mateix `data.json`: cada missió té `towns` (els taulers on surt) i `at` (el seu lloc al mapa de cada tauler), així que una missió que surt a dos taulers és la mateixa i en comparteix el progrés. Les posicions dels papers i els textos dels llocs són de cada tauler (`boards`). A la fitxa del DM, «Taulers» enllaça o desenllaça una missió d'un poble.
- «Importar» amb un fitxer d'un sol tauler (camp `board`, o qualsevol fitxer sense `boards` importat fora de Phentanil) afegeix les missions a aquell tauler i enllaça les que ja existeixen pel mateix id o pel mateix títol; una còpia sencera (amb `boards`) ho substitueix tot.
- Els noms del mapa són text SVG dibuixat amb la tipografia Antiquarian a partir de coordenades (`GEOM_PHENTANIL` i `GEOM_CONY` a `js/towns.js`, a 4950 d'ample), sobre `assets/map.webp` i `assets/map-cony-cirera.webp` (mapes sense etiquetes).
- Amb el mapa o un paper ampliats, la roda del ratolí fa zoom i el botó del mig arrossega (`onWheel`/`onPanStart` a `js/main.js`).
- Rendiment (el tauler sol anar en un ordinador carregat durant la sessió): la llum té tres nivells que es trien amb la tecla L o el botó «Llum» i es recorden al navegador. «Suau» (per defecte) mou l'ombra d'arbres per JS ~8 cops per segon; «quieta» no la mou gens; «viva» és l'ombra en WebGL (també amb `?gl=1`). L'ombra dels papers no és un `filter: drop-shadow` sinó una imatge ja desenfocada (`assets/sh-*.webp`) al mateix `::before` que la textura; si s'afegeix una textura nova cal generar-ne també l'ombra.
- En mode DM, «Moure papers» deixa arrossegar i girar (nansa ↻ o roda) cada paper, el mapa i la pila. Les posicions es desen a `layout` dins de les dades (es publiquen amb la resta) i el doble clic torna una peça al seu lloc automàtic.

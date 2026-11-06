# Wiki — La Mina Perduda del Phentanilo

Wiki de campanya D&D 5e construïda amb **Astro 6 + Tailwind CSS 4**. Totes les pàgines es generen estàticament a partir de fitxers Markdown.

## Comandes principals

```bash
nvm use            # Node 22 requerit (vegeu .nvmrc)
npm install        # tot el repositori (wiki, api/ i packages/model/ són espais de treball d'npm)
npm run dev        # wiki a localhost:4321/wiki
npm run dev -w @mina/api   # API de missions a localhost:8787 (PGlite a api/.dev-data, contrasenyes «grup» i «dm»)
npm run check      # tipus del wiki, de l'API i del model (també als workflows)
npm test           # tests del model, de les frases i de l'API (PGlite; amb TEST_DATABASE_URL=postgres://…/postgres, contra Postgres)
npm run test:e2e   # proves de punta a punta del tauler amb Playwright (engega l'API i el wiki sols)
npm run build      # genera el lloc a /dist
```

Per provar el tauler en local: `npm run dev -w @mina/api` en un terminal i `PUBLIC_MISSIONS_API_URL=http://127.0.0.1:8787 npm run dev` en un altre.

## Estructura del projecte

```
src/
├── content/             # tot el contingut editable
│   ├── characters/      # fitxers .md de PNJs, enemics i faccions
│   ├── places/          # fitxers .md dels llocs del món
│   └── croniques/       # fitxers .md de cada sessió
├── missions/            # el tauler de missions: codi, estils, mapes, textures i fonts
├── content.config.ts    # esquema dels camps de cada col·lecció
├── pages/               # rutes del lloc (no cal tocar-les normalment); missions/index.astro és el tauler i frases/index.astro el cercador de frases
├── layouts/             # BaseLayout i EntryLayout (fitxa amb columna lateral)
├── components/          # Navbar, Footer, SearchModal, Card, TagBadge, Breadcrumb, PageHeader, SectionHeader
├── lib/
│   ├── site.ts          # rutes (`url`, `routes`), etiquetes en català, format de dates i ordenació
│   └── git.ts           # data de l'últim commit de cada fitxer (per als «Últims canvis» de la portada)
└── styles/global.css    # colors i fonts (`@theme`), `.page`, `.cards-grid` i estils del Markdown
packages/model/          # @mina/model: dades del tauler compartides per l'API i el tauler (vegeu «Tauler de missions»)
packages/frases/         # @mina/frases: format, cerca i retalls del cercador de frases (vegeu «Frases»)
api/                     # @mina/api: l'API de missions que corre a la Mac mini
e2e/                     # proves de punta a punta del tauler (Playwright)
scripts/nova-sessio/     # troba i transcriu el vídeo d'una partida (vegeu «Sessió nova»)
scripts/frases/          # transcriu els vídeos de YouTube paraula per paraula per al cercador de frases
frases/                  # les frases de cada vídeo de YouTube (<id>.json), d'on surt el cercador
transcripts/             # transcripcions de les sessions (sessio-N.txt), d'on surten les cròniques
deploy/macmini/          # posada en marxa i actualització automàtica de l'API a la Mac mini
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

Normalment no cal escriure-la a mà: la fa el flux de **Sessió nova** (secció següent). A mà, o des de Claude Code amb `/nova-sessio` (la skill `.claude/skills/nova-sessio/SKILL.md`), és `src/content/croniques/sessio-N.md`:

```markdown
---
title: "Títol de la Sessió"
session: 4
date: 2026-06-21
summary: "Resum d'una frase per a les llistes."
players: ["Anna", "Marc", "Sara", "Pau"]
tags: ["tag1", "tag2"]
vod: "https://www.twitch.tv/videos/…"   # opcional: surt com a enllaç «Vídeo» a la fitxa
---

Contingut lliure en Markdown...
```

## Sessió nova (automàtic)

Després de cada partida **no cal fer res**: l'endemà arriba un PR per revisar.

1. Cada dia, `.github/workflows/nova-sessio.yml` mira el canal de Twitch (`divasytragonas`) i agafa el primer vídeo amb «SESSIÓ N» al títol que encara no té crònica ni PR. N surt del títol i la data, del vídeo.
2. Obre un issue de seguiment «🎲 Sessió N: …» (assignat als revisors) i hi va comentant com va.
3. Transcriu el vídeo amb AssemblyAI (`scripts/nova-sessio/sessio.py`, ~30 min) a `transcripts/sessio-N.txt`, a la branca `sessio-N`, amb l'hora del vídeo a cada paràgraf.
4. Claude Code segueix la skill `nova-sessio` en mode automàtic: llegeix tota la wiki, escriu la crònica, les fitxes noves i els afegits a les existents (mai reescriu ni toca els PCs), i deixa els dubtes per revisar a la descripció del PR. El workflow comprova `npm run check` i `npm run build`.
5. PR «Sessió N: …» amb els revisors (`REVISORS`, per defecte `CarlosChuan,devevalles`). Per corregir coses, un comentari «@claude …» al PR (`.github/workflows/claude.yml`) o editar el fitxer. **Merge** i es publica.

Altres maneres d'engegar-ho: **New issue → «🎲 Sessió nova»** amb l'enllaç (YouTube, un vídeo concret o refer una sessió), o **Actions → Sessió nova → Run workflow** (amb «minuts» es fa una prova barata amb només el principi del vídeo, en un PR en esborrany). Una branca `sessio-N` sense PR (alguna cosa va fallar) es torna a provar sola l'endemà sense tornar a transcriure. Per descartar una sessió, tanca'n el PR: ja no es torna a fer.

A mà, sense GitHub: `python scripts/nova-sessio/sessio.py transcriu --url <vídeo> --sessio N --data AAAA-MM-DD` (o `--audio fitxer.mp4`) i després `/nova-sessio N` a Claude Code.

**Secrets del repositori** (Settings → Secrets and variables → Actions):
- `ASSEMBLYAI_API_KEY`: la transcripció (assemblyai.com; menys d'1 $ per partida).
- `CLAUDE_CODE_OAUTH_TOKEN` (amb `claude setup-token`, va a compte de la subscripció) o `ANTHROPIC_API_KEY` (pagament per ús).
- `YTDLP_COOKIES` (opcional): galetes de YouTube en format Netscape, perquè YouTube bloqueja els servidors de GitHub. Caduquen; amb Twitch no calen.

I a Settings → Actions → General, «Allow GitHub Actions to create and approve pull requests» ha d'estar activat (si no, no pot obrir el PR). Els vídeos de Twitch caduquen al cap d'unes setmanes: per això es miren cada dia.

## Frases (cercador de clips)

A `/wiki/frases/` (enllaç «Frases» de la Navbar) es busca una paraula o una frase i surten tots els moments dels
vídeos del canal de YouTube ([@DIVASYTRAGONAS](https://www.youtube.com/@DIVASYTRAGONAS)) on algú la diu, i es
reprodueixen un darrere l'altre, com a playphrase.me.

- **Dades**: `frases/<id de YouTube>.json`, un per vídeo, amb cada frase i l'hora de cada paraula (format a
  `frases/README.md`). Són del vídeo de **YouTube**, no del de Twitch: el cercador el reprodueix d'allà (els de Twitch
  caduquen) i les hores han de coincidir. Per això no serveixen les transcripcions de `transcripts/`.
- **D'on surten**: `.github/workflows/frases.yml` mira el canal cada dia i transcriu amb AssemblyAI els vídeos que hi
  falten (`scripts/frases/frases.py`, 3 alhora, uns 15-20 min per partida i, com a «Sessió nova», menys d'1 $ cadascuna) i ho puja
  directament a `master` (i engega el desplegament). A mà: **Actions → Frases → Run workflow** (un vídeo concret, o
  com a molt N). Fa servir els mateixos secrets que «Sessió nova»: `ASSEMBLYAI_API_KEY` i, perquè YouTube bloqueja els
  servidors de GitHub, `YTDLP_COOKIES`. Si les galetes donen guerra, des d'una connexió de casa no calen: a la Mac
  mini, seguint `deploy/macmini/FRASES.md` (té un prompt per donar-li a Claude Code allà), o des de qualsevol
  ordinador amb `ASSEMBLYAI_API_KEY=… python scripts/frases/frases.py transcriu --pendents` i fer commit de `frases/`.
  Els vídeos marcats per a majors d'edat («GERMANS 1/2» i «2/2») necessiten galetes d'un compte major d'edat sempre.
- **Sense tornar a transcriure**: les transcripcions de «Sessió nova» que porten l'hora de cada paràgraf (de la 13
  endavant) tenen les mateixes hores que el vídeo de YouTube, així que se'n poden treure les frases de franc:
  `python scripts/frases/frases.py de-transcripcio transcripts/sessio-N.txt --id <id de YouTube>` (vigileu: a
  YouTube la numeració pot no coincidir amb la del wiki; la 13 del wiki és «SESSIÓ 12» a YouTube). L'hora de cada
  paraula és estimada dins del paràgraf: el fitxer queda amb `"aproximat": true`, el cercador hi deixa 1,5 s més de
  marge i hi posa «≈» davant de l'hora. El workflow no els torna a fer.
- **El wiki**: `src/lib/frases.ts` llegeix i valida els fitxers (un de mal format fa fallar el build i diu quin) i
  `src/pages/frases.json.ts` en fa un sol índex compacte (`/wiki/frases.json`, ~150 KB comprimits per partida) que la
  pàgina baixa sencer: la cerca es fa al navegador. `@mina/frases` (`packages/frases`) té el format de l'índex, la
  cerca (paraules senceres i seguides, sense accents, majúscules ni puntuació; mentre s'escriu, l'última paraula també
  pot ser el començament d'una de més llarga) i el retall de cada clip (la frase sencera, o el voltant de la troballa
  si la frase passa de 9 s).
- **El reproductor** és l'iframe de YouTube (`youtube-nocookie.com`): el clip s'atura sol quan acaba i, amb «Passa
  sola a la següent», salta al següent. Tecles: ← →, R (repeteix), / (cerca), Enter (següent). La cerca va a l'adreça
  (`?q=…`), així que es pot compartir.
- Si mai l'índex pesa massa (molts vídeos), caldrà partir-lo o passar la cerca a l'API de la Mac mini.

## Desplegament

- **Wiki (GitHub Pages)**: `.github/workflows/deploy.yml` a cada push a `master`, a `https://divas-tragonas.github.io/wiki`. Necessita la variable del repositori `MISSIONS_API_URL` (Settings → Secrets and variables → Actions → Variables) amb l'adreça pública de l'API: sense ella no publica res, perquè el tauler no sabria on anar.
- **Wiki (Vercel)**: `vercel.json` ja ho configura; al projecte cal `SITE_BASE=/`, `SITE_URL=https://<domini>`, `PUBLIC_MISSIONS_API_URL=https://<api>` i `VERCEL_DEEP_CLONE=true` (historial sencer per als «Últims canvis»). Els commits que només toquen `api/`, `deploy/` o `e2e/` no el reconstrueixen.
- **API (Mac mini)**: no la desplega GitHub. L'autofetch de la Mac mini manté el repositori al dia i `deploy/macmini/update.sh` construeix, prova i posa en marxa la versió nova si `api/` o `packages/` han canviat (vegeu `deploy/macmini/README.md`).
- **CI**: `.github/workflows/ci.yml` passa el check, tots els tests (PGlite i Postgres 16) i les proves de punta a punta a cada push i pull request. (Als PRs de «Sessió nova» no s'engega, perquè els obre el mateix GitHub Actions: per això el workflow ja comprova el check i el build.)

## Notes tècniques

- El `base` del lloc és `/wiki` (configurat a `astro.config.mjs`). Els links interns es fan amb `routes` o `url()` de `src/lib/site.ts`, que hi afegeixen el prefix.
- Els noms de fitxer dels `.md` es converteixen en la URL (p. ex. `lyra-solaris.md` → `/wiki/wiki/characters/lyra-solaris`: el primer `wiki` és el `base` i el segon la secció).
- Si s'afegeix un camp nou als frontmatters, cal actualitzar l'esquema a `src/content.config.ts`. Si és un valor nou d'un `enum` (`status`, `type`), també cal la seva etiqueta en català a `src/lib/site.ts` (el `npm run check` avisa si falta).
- Els colors són variables de `src/styles/global.css` (`var(--color-gold-500)`, `var(--color-stone-700)`…): als estils dels components no s'hi posen colors a mà.
- Els «Últims canvis» de la portada surten de l'historial de git; per això el workflow fa el checkout amb `fetch-depth: 0`.
- El cercador és un modal global (`src/components/SearchModal.astro`, obert des del botó de la Navbar o amb Ctrl+K); l'índex JSON es genera al build a `src/pages/cerca.json.ts` a partir de les col·leccions, així que el contingut nou s'hi indexa sol.

## Tauler de missions

Pàgina a pantalla completa a `/wiki/missions/`, enllaçada des de la Navbar, sense el layout del wiki ni Tailwind: `src/pages/missions/index.astro` (marcatge) i `src/missions/` (codi, estils, mapes, textures, fonts). Les missions són a l'**API de la Mac mini**; el tauler hi entra amb la contrasenya del grup, carrega el tauler del seu poble i rep els canvis en directe. Si el servidor no respon, ensenya l'última còpia que va rebre (sense res del DM), només per mirar.

### Com està fet

- **`packages/model`** (`@mina/model`): la font única de les dades. `schema.ts` (forma de missions, objectius, ecos, posicions i cossos de petició, amb zod), `towns.ts` (pobles i llocs del mapa: noms, coordenades, textos de les fitxes, enllaços al wiki), `visibility.ts` (què veu un jugador i què el DM), `changes.ts` (esdeveniments en directe que surten de cada canvi, filtrats per rol i poble) i `legacy.ts` (el format antic de `data.json` i d'«Exportar», en els dos sentits).
- **`api/`** (`@mina/api`, Hono + Drizzle + Postgres; PGlite per desenvolupar i provar):
  - `src/db/` taules i migracions (`npm run db:generate -w @mina/api` després de canviar `schema.ts`; s'apliquen soles). Les migracions han de ser compatibles amb la versió anterior: s'apliquen abans de canviar de versió.
  - `src/store/uow.ts`: **tot canvi passa per la unitat de treball**. Desa només el que ha canviat, puja la versió de cada missió i la revisió de la campanya, i apunta el canvi a `changes` amb l'estat d'abans i de després (historial, desfer i esdeveniments).
  - `src/services/domain.ts` les regles de cada acció; `history.ts` desfer; `snapshots.ts` còpies; `transfer.ts` importar/exportar i llegir el `data.json` xifrat d'abans.
  - `src/realtime/hub.ts` els esdeveniments (SSE a `GET /v1/events`): es llegeixen de `changes` per ordre de revisió, de manera que arriben en ordre, també els que fa la CLI, i qui es reconnecta rep el que s'ha perdut.
  - `src/http/` les rutes de `/v1` (cada ruta porta el seu middleware: `authed` o `dmAuthed`). `src/cli.ts` la CLI de la Mac mini.
  - Sessions amb clau *bearer* (el tauler la guarda al navegador): jugador un any; el permís de DM caduca als 30 dies o després de 12 h sense fer-lo servir. Contrasenyes amb scrypt a la taula `credentials`, que només canvia la CLI (`set-password`); com abans, no distingeixen majúscules ni espais.
- **El tauler** (`src/missions/`):
  - `main.js` l'aplicació (papers, zoom, mapa, moure papers, mode DM, historial, entrada); `api.js` el client (peticions i canal d'esdeveniments amb `fetch`); `remote.js` la sincronització: cada canvi del DM s'aplica de seguida al tauler i s'envia en una cua ordenada que es reintenta sense connexió; mentre un element té canvis per enviar, els esdeveniments no el toquen.
  - `towns.js` els pobles de `@mina/model` amb els mapes; `layout.js` geometria; `light.js` la llum; `pixel.js` el «Mapa en píxel»; `gate.js`, `ui.js`, `util.js`.
  - `app.css` i `assets/`: textures de paper (`paper-*.webp`) amb les seves ombres (`sh-*.webp`), mapes i tipografies Antiquarian. GSAP ve de npm.
  - Les fitxes dels llocs del mapa enllacen al wiki amb `character` o `place` (a `packages/model/src/towns.ts`); si la pàgina no existeix, el build falla.

### Funcionament

- Hi ha un tauler per poble: Phentanil a `/wiki/missions/` i Cony Cirera a `/wiki/missions/?lloc=cony-cirera`. Una missió surt als taulers de `towns` (un mapa poble → lloc del mapa), així que la mateixa missió pot ser a dos pobles i en comparteix el progrés. Posicions dels papers i textos dels llocs són de cada tauler.
- **Mode DM** (botó «Mode DM» o tecla D, amb la contrasenya del DM): s'escriu sobre el paper i a la fitxa del DM, i **cada canvi es desa sol** i surt al moment a les altres pantalles (la barra diu «Tot desat», «Desant…» o «Sense connexió»). Les missions noves neixen ocultes. Si dues pantalles del DM canvien la mateixa missió alhora, la segona rep la versió de la primera i un avís.
- **Historial** (barra del DM): els últims canvis amb «Desfer», les còpies (de cada nit, d'abans d'importar o restaurar, i les que fa el DM) amb «Restaurar», i els dispositius amb sessió (es poden treure).
- **Exportar** baixa tota la campanya en el format antic (es pot tornar a importar). **Importar** una còpia sencera (amb `boards`) ho substitueix tot (abans en fa una còpia); un fitxer d'un sol tauler (`board`, o qualsevol sense `boards` importat fora de Phentanil) afegeix les missions a aquell tauler i enllaça les que ja hi són pel mateix id o pel mateix títol.
- Sortir del mode DM treu el permís de DM a la sessió d'aquella pantalla: per tornar-hi cal la contrasenya.
- Els noms del mapa són text SVG dibuixat amb la tipografia Antiquarian a partir de coordenades (a 4950 d'ample), sobre `src/missions/assets/map.webp` i `map-cony-cirera.webp` (mapes sense etiquetes).
- Amb el mapa o un paper ampliats, la roda del ratolí fa zoom i el botó del mig arrossega (`onWheel`/`onPanStart` a `main.js`).
- **Mapa en píxel** (Cony Cirera: tecla **P**, també fora del mode DM, o el botó «Mapa en píxel» de la barra del DM): el mapa pintat es transforma en el de la missió de l'RPG Map Viewer amb una onada de caselles (una per casella del mapa del visor, 36×25). ⚠️ L'onada es pinta en **un sol `<canvas>`** (el gir sobre la diagonal vist des de dalt és afí: `setTransform` + `drawImage`, només les caselles a mig girar cada fotograma; les imatges es reescalen fora del fil principal amb `createImageBitmap`). La primera versió eren 900 elements amb `preserve-3d` i anava a ~4 fps: no tornar-hi. La pantalla de jugador es carrega **amagada** (`display: none`) en quant el visor saluda, perquè no competeixi amb l'onada, i es reaprofita a cada P. Després hi entra la pantalla de jugador del visor en directe (iframe de `/player?embed=1`), que s'eixampla a tota la pantalla i segueix la càmera del DM. Esc o «← Tauler» hi torna amb l'onada al revés. **Vora de paper gastat** (`fadeOf`/`framedPix` a `pixel.js`): el mapa pintat s'esvaeix a les vores com una aquarel·la gastada i el de píxel no; a l'onada i mentre la pantalla de jugador ensenya el mapa sencer, el de píxel porta la mateixa vora, treta del pintat (com més clar respecte de l'interior, més gastat). ⚠️ Es **treu pigment** (paper × transmitància^(1 − fade)), no s'hi posa un vel blanc: la primera versió ho feia i semblaven núvols. ⚠️ El mapa en píxel ve del visor sense CORS i no se'n poden llegir els píxels: la potència es fa només amb capes (`fadeLayers`: soft-light amb blanc ≈ arrel quadrada, per trams amb màscares, i × paper). Les mateixes capes es dibuixen a l'onada i es posen damunt de la pantalla de jugador amb `mix-blend-mode`, o sigui que **la vora no depèn de cap mapa**: si es torna a generar el mapa del visor (o el pintat) o la pantalla ensenya un altre lloc, la vora hi és igual (el mapa en píxel ha de tenir la mateixa proporció que el pintat, com ja calia per a l'onada). ⚠️ El contenidor de les capes no pot tenir opacitat, transform ni z-index (faria un grup a part i no es fondrien amb l'iframe): s'esvaeixen les capes. Es prepara un cop, quan el navegador no té feina, després de la salutació del visor. **Sense API del visor**: el DM obre aquest tauler des del visor (menú Pantalles → «Obrir el tauler de missions») i el tauler parla amb el visor pel seu `window.opener` (`VW` a `pixel.js`): el visor li passa el canal de sincronització amb `postMessage` i el tauler el reenvia a la pantalla incrustada, i al revés (sobre `{ rpg: 'bc', msg }`; salutació `bc-hello`, que porta l'adreça del visor, d'on surten l'iframe i el mapa en píxel). Si el tauler no s'ha obert des del visor, el botó ho diu i no fa res. El visor només accepta el tauler de l'adreça que obre (`BOARD_URL` del seu `lib/relay.ts`): si el tauler canvia de domini (Vercel), cal canviar-la allà. Es configura a `pixel` de Cony Cirera a `packages/model/src/towns.ts`, el codi és a `src/missions/pixel.js` i el protocol amb la pantalla incrustada és al `CLAUDE.md` del visor.
- Rendiment (el tauler sol anar en un ordinador carregat durant la sessió): la llum té tres nivells que es trien amb la tecla L o el botó «Llum» i es recorden al navegador. «Suau» (per defecte) mou l'ombra d'arbres per JS ~8 cops per segon; «quieta» no la mou gens; «viva» és l'ombra en WebGL (també amb `?gl=1`). L'ombra dels papers no és un `filter: drop-shadow` sinó una imatge ja desenfocada (`sh-*.webp`) al mateix `::before` que la textura; si s'afegeix una textura nova cal generar-ne també l'ombra.
- En mode DM, «Moure papers» deixa arrossegar i girar (nansa ↻ o roda) cada paper, el mapa i la pila; les posicions es desen soles i el doble clic torna una peça al seu lloc automàtic.

### El `data.json` d'abans

El tauler d'abans de l'API guardava les missions a `public/missions/data.json` (xifrat; la part `dm` amb la contrasenya del DM d'abans). No es va poder importar perquè ningú recorda aquella contrasenya, i s'ha tret del repositori: el tauler nou va començar buit. Si mai apareix la contrasenya, el fitxer és a l'historial (`git show 7ef678c:public/missions/data.json > data.json`) i es pot carregar amb `cli import-data-json data.json` (vegeu `deploy/macmini/README.md`; si la base de dades ja té missions, cal `--force`, que les substitueix).

---
name: nova-sessio
description: Escriu la crònica d'una sessió de D&D a partir de la seva transcripció (transcripts/sessio-N.txt) i proposa els canvis a la wiki que en surten (PNJs, llocs i faccions nous; canvis d'estat de les fitxes existents). Fes-la servir quan es demani «genera la crònica», «escriu la crònica de la sessió N», «la sessió nova», o quan el workflow «Sessió nova» la demana en mode automàtic.
---

# nova-sessio

Genera la crònica d'una sessió de D&D a partir d'una transcripció en brut i hi afegeix a la wiki tot el que en surt.

## Dos modes

- **Automàtic** (el workflow `.github/workflows/nova-sessio.yml`; el prompt ho diu): no hi ha ningú per respondre. **No preguntis res**: escriu tots els fitxers i posa cada dubte a la descripció del PR (`.nova-sessio/pr.md`), on el revisarà un humà. Quan un dubte afecta el text, tria l'opció més prudent (ometre-ho o `[poc clar]`) i digues-ho al PR.
- **Interactiu** (algú ho demana des de Claude Code): pregunta el que no es pugui deduir i ensenya les propostes (crònica, fitxes noves i modificacions) abans d'escriure res.

Tota la resta és igual en els dos modes.

## Pas 1 — La transcripció

- Per defecte és a `transcripts/sessio-N.txt`. Si l'usuari passa un altre fitxer o enganxa el text al xat, fes servir això.
- Les transcripcions noves tenen una capçalera (`# Sessió N: títol`, `# Data`, `# VOD`, `# Idioma`) i paràgrafs amb l'hora del vídeo (`[1:02:03] …`). Les antigues són un sol bloc de text sense hores.
- Són llargues (100–300 KB): llegeix-les **senceres**, en blocs amb `offset` + `limit`. No resumeixis a partir del principi.
- És una transcripció automàtica en català (amb castellà barrejat): els noms propis hi surten sovint malament («Líria Andor» = Liriandor, «Barra de Vidre» = Vara de Vidre). Corregeix-los amb els noms canònics de la wiki.

## Pas 2 — Llegir tota la wiki

Llegeix en paral·lel, totes alhora:

- Tots els fitxers de `src/content/croniques/`: l'arc de la campanya, el número de la darrera sessió, els jugadors habituals i els fils pendents (sobretot l'«Estat al final» de l'última).
- Tots els fitxers de `src/content/characters/`: noms canònics dels PNJs, el seu estat (`ally` / `defeated` / etc.) i el seu rol. Els que tenen `pc: true` són els personatges dels jugadors (`player` diu qui el porta).
- Tots els fitxers de `src/content/places/`: noms canònics dels llocs.

## Pas 3 — Metadades

- **Número de sessió**: el que diu el prompt o la capçalera; si no, el següent a l'última crònica.
- **Data**: la del prompt o la capçalera (és la del vídeo). Si no n'hi ha, l'«Estat al final» de l'última crònica sovint diu quan era la propera; si tampoc, pregunta (interactiu) o posa-hi la més probable i digues-ho al PR (automàtic).
- **`vod`**: l'enllaç del vídeo, si n'hi ha.
- **Jugadors presents** (`players`): noms reals de les persones, com a les cròniques anteriores. Parteix dels jugadors dels PCs (`player`) i de qui surt a la transcripció (qui parla, qui no hi és, convidats). Si no és clar, pregunta (interactiu) o posa la llista més probable i marca-la com a dubte (automàtic).

## Pas 4 — Escriure la crònica

Amb el prompt de més avall, la transcripció sencera i el context de la wiki (personatges actius, llocs, fils pendents de l'última sessió).

## Pas 5 — Entitats noves i modificacions a la wiki

Compara la transcripció amb els fitxers de `characters/` i `places/` que ja hi ha.

### 5a. Entitats noves

- **PNJs nous**: personatges amb nom propi que interactuen amb el grup i no existeixen a `characters/`.
- **Llocs nous**: llocs visitats o esmentats amb pes a la història que no existeixen a `places/`.
- **Faccions o grups nous**: organitzacions rellevants sense entrada pròpia.

No facis fitxa de qualsevol nom que surti un cop de passada: només del que tornarà a sortir o importa a la història. Si dubtes, no la facis i esmenta-ho al PR com a «possible fitxa».

**Per a un PNJ** (`src/content/characters/nom-del-personatge.md`):
```markdown
---
name: "Nom"
description: "Una frase."
role: "Aliat / Enemic / Funcionari / etc."   # opcional
type: "humanoid"                              # opcional: creature | humanoid | faction | undead | fiend | other
status: "unknown"                             # ally | neutral | active | defeated | unknown
tags: []
---
Contingut breu basat en el que apareix a la transcripció.
```

**Per a un lloc** (`src/content/places/nom-del-lloc.md`):
```markdown
---
name: "Nom del Lloc"
type: "city"   # city | dungeon | forest | ruin | region | other
description: "Una frase."
tags: []
---
Contingut breu basat en el que apareix a la transcripció.
```

### 5b. Modificacions a entitats existents (només afegits)

La crònica és un registre narratiu, però certs **canvis permanents al món** s'han de reflectir també a la fitxa de l'entitat afectada perquè condicionaran com apareixerà a futures sessions:

- Un PNJ **mor, queda derrotat, es rendeix o desapareix definitivament** (`status` a `defeated`).
- Un PNJ passa a ser **aliat permanent** del grup o **enemic declarat** (`status` a `ally` / `active`).
- Un lloc queda **destruït, cremat, abandonat, alliberat o ocupat per una nova facció**.
- Una facció es **desarticula, canvia de lideratge o es fusiona** amb una altra.
- **Transformació física** del PNJ o lloc, canvi de nom públic, o revelació de la seva veritable identitat.

**Regles fonamentals:**

1. **Només afegir, mai reescriure ni esborrar.** Tot el text i el frontmatter existent queda intacte. Els canvis vàlids són:
   - Afegir un bullet nou al final d'una llista existent.
   - Afegir una secció nova al final del fitxer, amb la referència de la sessió: `## Després de la sessió N` o `## Sessió N — [event breu]`. Exemple: *"A la sessió 11, [PNJ] es transforma permanentment en un lich després del ritual al Pacte del Fentanilo. Manté el record de les seves aliances però ja no pot sortir al sol."*
   - Actualitzar el camp `status` del frontmatter si l'estat de l'entitat canvia.
   - **Afegir enllaços a mencions existents** d'entitats que ara tenen fitxa pròpia: embolcallar el nom en un enllaç Markdown (`[**Nom**](/wiki/wiki/characters/slug)` o `.../places/slug`) sense tocar el text del voltant. Sempre que es crea una fitxa nova, cal buscar les mencions al seu nom a les altres fitxes i cròniques i enllaçar-les. També es pot actualitzar un bullet de menció (p. ex. a `## Gent coneguda` d'un lloc) si ha quedat obsolet pel que ara sabem —però només aquest bullet, no la prosa.
2. **No tocar `name`, `description`, `role`, `type`, `tags`, `image`.** Són la identitat editorial de l'entitat. Si la descripció ja no és certa, proposa el canvi (al PR, en mode automàtic); no el facis.
3. **Res inventat.** Només canvis que consten **explícitament** a la transcripció. Un PNJ que apareix i actua però no canvia d'estat no requereix cap modificació.
4. **Mai modificar fitxers de PCs** (`pc: true`). Els jugadors mantenen les seves fitxes fora de la wiki (vegeu `CLAUDE.md`).
5. **Spoilers del DM**: si la transcripció conté coses que els jugadors no saben (el DM pensant en veu alta, preparació, coses dites fora de joc), no surten enlloc —ni a la crònica ni a les fitxes. En mode automàtic, si n'has omès alguna, digues al PR *que* n'has omès (sense dir quina) perquè el DM ho comprovi.

En mode interactiu, ensenya cada modificació (fitxer, canvi de `status` si n'hi ha, text i on va) i espera l'aprovació abans d'editar.

## Pas 6 — Escriure els fitxers

En aquest ordre:
1. Les fitxes noves de `characters/` i `places/`.
2. Les modificacions a fitxers existents, amb `Edit` (**mai** `Write` sobre un fitxer existent: el sobreescriuria sencer).
3. La crònica a `src/content/croniques/sessio-N.md`.

Després, `npm run check` i `npm run build`. Si fallen per culpa dels fitxers nous (frontmatter, un `type` o `status` que no existeix, un enllaç trencat), arregla-ho i torna-hi.

## Pas 7 (mode automàtic) — La descripció del PR

Escriu-la a `.nova-sessio/pr.md`. És el que llegirà qui revisa, sovint des del mòbil: curta, en català i amb el més important primer.

```markdown
## Sessió N: Títol

Resum de 2-3 frases del que va passar.

### ⚠️ Per revisar
- [ ] Jugadors: he posat Carlos, Enric… — [per què, si no és clar]
- [ ] «Kumomi» o «Kumonmi»? Surt així a [1:02:03](enllaç al vídeo amb ?t=1h02m03s): he posat Kumonmi.
- [ ] He omès una cosa que semblava un spoiler del DM (vers [2:10:00](…)).
(Només els dubtes reals, amb l'hora del vídeo quan n'hi hagi. Si no n'hi ha cap, «Res a destacar».)

### Fitxers nous
- `src/content/characters/x.md` — qui és, en una frase.

### Canvis a fitxes existents
- `src/content/characters/y.md` — **active → defeated**: per què.
- Enllaços nous a x des de: …

### Possibles fitxes que no he fet
- (noms que potser mereixen fitxa, si n'hi ha)
```

Els enllaços a una hora del vídeo: Twitch `https://www.twitch.tv/videos/ID?t=1h02m03s`, YouTube `https://www.youtube.com/watch?v=ID&t=3723s`.

---

## Format de la crònica

Les cròniques existents segueixen aquest format exacte. Respecta'l:

```markdown
---
title: "Títol de la Sessió"
session: N
date: YYYY-MM-DD
summary: "Una frase que funcioni com a subtítol a les llistes: on eren, què van fer, com va acabar."
players: ["Jugador1", "Jugador2", ...]
tags: ["tag1", "tag2"]
vod: "https://www.twitch.tv/videos/…"   # si n'hi ha
---

## Resum

1-3 frases. Punt d'entrada per a qui no ha llegit res: situa el grup, el que estava en joc i com va acabar.

## Esdeveniments principals

2-4 paràgrafs de prosa narrativa cronològica. Tercera persona, to èpic però accessible i proper. Inclou el context d'on era el grup al principi, els girs importants, les decisions clau i les accions més memorables dels personatges. Escriu com un cronista, no com una llista.

## Descobriments

Botí, revelacions, objectes, informació nova sobre la trama o el món. Pot ser 1-2 paràgrafs o una prosa breu. Si no hi va haver descobriments rellevants, ometre la secció.

## Moments memorables

- El moment X: descripció específica i vívida.
- El moment Y: descripció específica i vívida.
- El moment Z: descripció específica i vívida.

(3-5 ítems. Inclou moments tàctics, moments de rol, moments divertits i moments de tensió.)

## Estat al final

1-2 paràgrafs: on ha quedat el grup, quins fils han quedat oberts, quina és la propera sessió si consta.
```

A la crònica, la primera menció de cada PNJ o lloc amb fitxa va enllaçada (`[**Nom**](/wiki/wiki/characters/slug)`), com a les cròniques anteriors.

**Tags recomanats** (els que apliquin; reutilitza els que ja surten a altres cròniques abans d'inventar-ne):
- Per tipus: `combat`, `infiltracio`, `rescat`, `revelacio`, `exploracio`, `negociacio`
- Per lloc: `phentanil`, `mansio-de-la-cendra`, `castell-de-la-fumarola`
- Per faccions/personatges notables: `vaina-roja`, `gota`, etc.
- Per fites: `boss`, `mort-pnj`, `objecte-magic`

---

## Prompt per generar el contingut

---

Ets el cronista oficial d'una campanya de Dungeons & Dragons ambientada al món de La Mina Perduda del Phentanilo. Reps la transcripció en brut d'una sessió de joc —pot contenir xerrameca fora de joc, bromes, interrupcions, silencis i soroll de fons— i el context actual de la wiki de la campanya.

La teva tasca és generar una **crònica estructurada en català** per a la wiki de la campanya. Ha de ser útil tant per als jugadors que volen repassar la sessió com per a qui se la va perdre, i ha de servir com a registre permanent de la campanya.

**Context de la wiki (estat actual):**
[Personatges amb nom canònic i estat, llocs, i resum dels fils pendents de l'última sessió]

**Normes:**
- Tot en català. Usar els noms canònics de la wiki (ex: "Vara de Vidre", no "el mag", "la Mansió de la Cendra", no "la mansió").
- No inventar fets que no apareguin a la transcripció. Si alguna cosa és poc clara, usar [poc clar] o ometre-la.
- Filtrar tot el contingut fora de joc: dubtes de regles, bromes, interrupcions, "espera que miro el mòbil", etc. Queda't amb els moments de joc reals.
- El to ha de ser narratiu i proper, com una crònica escrita per algú que estava allà: precís en els fets, vívid en els moments bons.
- La secció "Moments memorables" ha de ser concreta: no "van tenir un combat difícil" sinó "Jaume va aconseguir un 20 natural i va dividir l'ogre per la meitat enmig d'un silenci sepulcral".
- Per al camp `summary` del frontmatter: una sola frase que funcioni com a subtítol a les llistes. Màxim 15-20 paraules.
- Per al camp `title`: un títol breu i evocador (3-6 paraules), com "L'Assalt a la Mansió de la Cendra" o "Disfressats de Baines Roges". El títol del vídeo de Twitch és una pista, però sovint és una broma: tria'l tu.

**Transcripció de la sessió:**
[La transcripció completa]

---

## Notes finals

- Les modificacions a fitxers existents de `characters/` i `places/` són **només afegits** (Pas 5b). **Mai** reescriure, resumir ni esborrar prosa existent.
- **No modificar mai** fitxers amb `pc: true`.
- Res de spoilers del DM, ni a la crònica ni a les fitxes.
- En mode interactiu, ensenya la crònica, les fitxes noves i les modificacions i espera l'aprovació **abans** d'escriure cap fitxer. En mode automàtic, escriu-ho tot i deixa els dubtes al PR.

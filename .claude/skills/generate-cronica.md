# generate-cronica

Genera la crònica d'una sessió de D&D a partir d'una transcripció en brut.

## Quan usar-la

Quan l'usuari vol generar la crònica d'una sessió. Invocacions típiques: "genera la crònica", "escriu la crònica de la sessió", "genera el resum de la sessió", o quan l'usuari adjunta una transcripció.

## Com executar-la

### Pas 1 — Identificar la transcripció

- Si l'usuari ha passat un path de fitxer com a argument (ex: `/generate-cronica transcripts/sessio-11.txt`), llegir aquest fitxer.
- Si l'usuari ha enganxat el contingut directament al xat, usar-lo tal qual.
- Per convenció, els fitxers de transcripció i apunts es guarden a `transcripts/` (ex: `transcripts/sessio-1-apunts.txt`, `transcripts/sessio-11.txt`).
- Si no queda clar, preguntar: "Quin fitxer de transcripció vols usar? Pots passar-me el path o enganxar el contingut."

Si el fitxer és gran, llegir-lo en blocs amb `offset` + `limit`.

### Pas 2 — Llegir el context de la wiki

Llegir en paral·lel (totes alhora, no sequencialment):

- Tots els fitxers de `src/content/croniques/` → entendre l'arc de la campanya, el número de la darrera sessió i els fils pendents
- Tots els fitxers de `src/content/characters/` → noms canònics dels PNJs, el seu estat (`ally` / `defeated` / etc.) i el seu rol
- Tots els fitxers de `src/content/places/` → noms canònics dels llocs

### Pas 3 — Determinar els metadades

De la transcripció i el context de la wiki, extreure:
- **Número de sessió**: el següent a l'última crònica existent (si la darrera és la 10, aquesta és la 11)
- **Data de la sessió**: si no consta a la transcripció, llegir l'"Estat al final" de l'última crònica (sovint esmenta quan és la propera sessió) o preguntar
- **Jugadors presents**: buscar mencions de noms a la transcripció; si no queda clar, preguntar

Si algun d'aquests tres camps no es pot determinar, preguntar a l'usuari **abans** de generar.

### Pas 4 — Generar la crònica

Usar el prompt de generació de més avall amb:
1. La transcripció completa
2. El resum del context de la wiki (personatges actius, llocs, fils pendents de l'última sessió)

### Pas 5 — Identificar entitats noves per a la wiki

Abans d'escriure res, revisar la transcripció i comparar-la amb els fitxers de `characters/` i `places/` ja existents. Detectar:

- **PNJs nous**: personatges amb nom propi que interactuen amb el grup i no existeixen a `characters/`.
- **Llocs nous**: llocs visitats o esmentats que no existeixen a `places/`.
- **Faccions o grups nous**: organitzacions rellevants sense entrada pròpia.

Per cada entitat detectada, proposar a l'usuari crear-ne una fitxa nova. Incloure un esborrany mínim per a cadascuna basat en la informació de la transcripció:

**Per a un PNJ:**
```markdown
---
name: "Nom"
description: "Una frase."
role: "Aliat / Enemic / Funcionari / etc."   # opcional
type: "humanoid"                              # opcional
status: "unknown"
tags: []
---
Contingut breu basat en el que apareix a la transcripció.
```

**Per a un lloc:**
```markdown
---
name: "Nom del Lloc"
type: "city"   # city | dungeon | forest | ruin | region | other
description: "Una frase."
tags: []
---
Contingut breu basat en el que apareix a la transcripció.
```

Presentar les fitxes proposades a l'usuari i esperar confirmació o correccions **abans** d'escriure cap fitxer. L'usuari pot aprovar-les tal qual, modificar-les o descartar-les.

### Pas 6 — Escriure els fitxers

Amb l'aprovació de l'usuari, escriure en aquest ordre:
1. Els fitxers nous de `characters/` i/o `places/` aprovats.
2. La crònica a `src/content/croniques/sessio-N.md`.

---

## Format de la crònica

Les còniques existents segueixen aquest format exacte. Respectar-lo:

```markdown
---
title: "Títol de la Sessió"
session: N
date: YYYY-MM-DD
summary: "Una frase que funcioni com a subtítol a les llistes: on eren, què van fer, com va acabar."
players: ["Jugador1", "Jugador2", ...]
tags: ["tag1", "tag2"]
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

**Tags recomanats** (usar els que apliquin):
- Per tipus: `combat`, `infiltracio`, `rescat`, `revelacio`, `exploracio`, `negociacio`
- Per lloc: `phentanil`, `mansio-de-la-cendra`, `castell-de-la-fumarola`
- Per faccions/personatges notables: `baina-roja`, `gota`, etc.
- Per fites: `boss`, `mort-pnj`, `objecte-magic`

---

## Prompt per generar el contingut

Quan generis la crònica, usa aquest prompt (substituir els blocs entre []):

---

Ets el cronista oficial d'una campanya de Dungeons & Dragons ambientada al món de La Mina Perduda del Phentanilo. Reps la transcripció en brut d'una sessió de joc —pot contenir xerrameca fora de joc, bromes, interrupcions, silencis i soroll de fons— i el context actual de la wiki de la campanya.

La teva tasca és generar una **crònica estructurada en català** per a la wiki de la campanya. Ha de ser útil tant per als jugadors que volen repassar la sessió com per a qui se la va perdre, i ha de servir com a registre permanent de la campanya.

**Context de la wiki (estat actual):**
[Inserir aquí: llista de personatges amb nom canònic i estat, llocs, i resum dels fils pendents de l'última sessió]

**Normes:**
- Tot en català. Usar els noms canònics de la wiki (ex: "Vara de Vidre", no "el mag", "la Mansió de la Cendra", no "la mansió").
- No inventar fets que no apareguin a la transcripció. Si alguna cosa és poc clara, usar [poc clar] o ometre-la.
- Filtrar tot el contingut fora de joc: regles dubtes, bromes, interrupcions, "espera que miro el mòbil", etc. Queda't amb els moments de joc reals.
- El to ha de ser narratiu i proper, com una crònica escrita per algú que estava allà: precís en els fets, vívid en els moments bons.
- La secció "Moments memorables" ha de ser concreta: no "van tenir un combat difícil" sinó "Jaume va aconseguir un 20 natural i va dividir l'ogre per la meitat enmig d'un silenci sepulcral".
- Per al camp `summary` del frontmatter: una sola frase que funcioni com a subtítol a les llistes. Màxim 15-20 paraules.
- Per al camp `title`: un títol breu i evocador (3-6 paraules), com "L'Assalt a la Mansió de la Cendra" o "Disfressats de Baines Roges".

**Transcripció de la sessió:**
[Inserir aquí la transcripció completa]

---

## Notes finals

- No modificar fitxers **existents** de `characters/` ni de `places/`. La crònica és un registre narratiu, no una actualització de l'estat del món. Les fitxes noves sí que es poden crear (Pas 5).
- Si la transcripció conté spoilers del DM (coses que els jugadors no saben), ometre-los de la crònica.
- Mostrar la crònica i les fitxes proposades a l'usuari i esperar aprovació **abans** d'escriure cap fitxer.

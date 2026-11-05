# Frases dels vídeos

Les transcripcions dels vídeos del canal de YouTube per al cercador de frases del wiki (`/wiki/frases/`): un fitxer
per vídeo, `<id de YouTube>.json`. No s'escriuen a mà: les fa `scripts/frases/frases.py` (el workflow «Frases», cada
dia). Vegeu la secció «Frases» del `CLAUDE.md`.

```jsonc
{
  "id": "cUTUoES4vIc",                 // id del vídeo de YouTube (= nom del fitxer)
  "titol": "D&D SESSIÓ 12 - AGATHA, AGARRAME ESTA!",
  "data": "2026-11-02",
  "durada": 16618,                     // segons
  "idioma": "ca",
  "frases": [
    // [inici, fi, text, inici de cada paraula]: ms des de l'inici del vídeo; les paraules, des de l'inici de la frase.
    // El text són les paraules separades per un sol espai (tantes com temps).
    [160650,162400,"Bona nit a tothom!",[0,420,780]]
  ]
}
```

Per corregir una paraula mal transcrita es pot editar el text directament, sempre que la frase continuï tenint el
mateix nombre de paraules que de temps (si no, el build falla i diu quina és).

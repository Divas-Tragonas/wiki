#!/usr/bin/env python3
"""
Frases dels vídeos: transcriu els vídeos del canal de YouTube amb l'hora de cada paraula, per al cercador
de frases del wiki (/wiki/frases/). Cada vídeo queda a frases/<id de YouTube>.json.

Les fa el workflow `.github/workflows/frases.yml`, però també es pot fer anar a mà:

  python scripts/frases/frases.py pendents                        # vídeos del canal que encara no hi són
  python scripts/frases/frases.py transcriu --pendents            # els transcriu tots (--max N: només N)
  python scripts/frases/frases.py transcriu --url <vídeo> [--url <vídeo> …]
  python scripts/frases/frases.py transcriu --url <vídeo> --audio partida.mp4   # amb l'àudio ja baixat
  python scripts/frases/frases.py transcriu --url <vídeo> --minuts 5 --carpeta /tmp/prova   # prova barata

Ha de ser el vídeo de YouTube (no el de Twitch): el cercador el reprodueix d'allà i les hores han de coincidir.
`transcriu` necessita ASSEMBLYAI_API_KEY i ffmpeg; des d'un servidor, YouTube demana galetes (YTDLP_COOKIES_FILE).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "nova-sessio"))
import sessio  # noqa: E402  (baixar l'àudio, passar-lo a mp3, opcions de yt-dlp)

FRASES = ROOT / "frases"
CANAL = os.environ.get("FRASES_CANAL", "https://www.youtube.com/@DIVASYTRAGONAS/videos")

# Com es parteix el text en frases (cada frase és un clip del cercador)
PAUSA_MS = 1500  # un silenci així tanca la frase
MAX_PARAULES = 25  # una frase sense punts no s'allarga més que això…
COMA_DES_DE = 14  # …i a partir d'aquí es talla a la primera coma
FINAL = re.compile(r"[.?!…][\"'»”)\]]*$")


# ── Vídeos ──────────────────────────────────────────────────────────────

def fetes() -> set[str]:
    return {f.stem for f in FRASES.glob("*.json")}


def videos_del_canal() -> list[dict]:
    import yt_dlp

    with yt_dlp.YoutubeDL(sessio.ydl_opts({"extract_flat": True})) as ydl:
        canal = ydl.extract_info(CANAL, download=False)
    return [
        {"id": e["id"], "titol": e.get("title") or "", "url": f"https://www.youtube.com/watch?v={e['id']}"}
        for e in canal.get("entries") or []
        if e.get("id")
    ]


def pendents() -> list[dict]:
    ja = fetes()
    # del més vell al més nou, perquè si no hi ha temps per a tots, els que falten siguin els últims
    return [v for v in reversed(videos_del_canal()) if v["id"] not in ja]


# ── Frases ──────────────────────────────────────────────────────────────

def frases_de(paraules: list[tuple[str, int, int]]) -> list[list]:
    """[(text, inici, fi)] en ms → [[inici, fi, text, [inici de cada paraula des de l'inici de la frase]]]"""
    frases: list[list] = []
    actual: list[tuple[str, int, int]] = []

    def tanca() -> None:
        if actual:
            inici = actual[0][1]
            frases.append([inici, actual[-1][2], " ".join(p[0] for p in actual), [p[1] - inici for p in actual]])
            actual.clear()

    for text, inici, fi in paraules:
        text = re.sub(r"\s+", "", text or "")
        if not text:
            continue
        if actual and (inici - actual[-1][2] > PAUSA_MS or len(actual) >= MAX_PARAULES):
            tanca()
        actual.append((text, inici, max(fi, inici)))
        if FINAL.search(text) or (len(actual) >= COMA_DES_DE and text.endswith((",", ";", ":"))):
            tanca()
    tanca()
    return frases


def escriu(cami: Path, video: dict, frases: list[list]) -> None:
    """Una frase per línia: el fitxer es pot llegir i els canvis es veuen bé al git."""
    linies = ["{"]
    for k in ("id", "titol", "data", "durada", "idioma"):
        linies.append(f"  {json.dumps(k)}: {json.dumps(video[k], ensure_ascii=False)},")
    linies.append('  "frases": [')
    for i, f in enumerate(frases):
        coma = "," if i < len(frases) - 1 else ""
        linies.append("    " + json.dumps(f, ensure_ascii=False, separators=(",", ":")) + coma)
    linies += ["  ]", "}"]
    cami.parent.mkdir(parents=True, exist_ok=True)
    cami.write_text("\n".join(linies) + "\n", encoding="utf-8")


def transcriu_paraules(audio: Path, idioma: str) -> list[tuple[str, int, int]]:
    import assemblyai as aai

    aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
    model = os.environ.get("ASSEMBLYAI_MODEL", "universal-2")
    config = aai.TranscriptionConfig(speech_models=[model], language_code=idioma, punctuate=True, format_text=True)
    t = aai.Transcriber(config=config).transcribe(str(audio))
    if t.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"AssemblyAI: {t.error}")
    return [(w.text, w.start, w.end) for w in t.words or []]


def transcriu_video(url: str, args: argparse.Namespace) -> str:
    info = sessio.info_video(url)
    video = {
        "id": info["id"],
        "titol": (info.get("title") or "").strip(),
        "data": sessio.data_video(info),
        "durada": int(info.get("duration") or 0),
        "idioma": args.idioma,
    }
    print(f"▶ {video['id']} · {video['titol']}", flush=True)
    with tempfile.TemporaryDirectory(prefix="frases-") as tmp:
        carpeta = Path(tmp)
        original = Path(args.audio) if args.audio else sessio.baixa_audio(url, carpeta, args.minuts)
        paraules = transcriu_paraules(sessio.a_mp3(original, carpeta, args.minuts), args.idioma)
    frases = frases_de(paraules)
    if not frases:
        raise RuntimeError("la transcripció ha sortit buida")
    cami = Path(args.carpeta) / f"{video['id']}.json"
    escriu(cami, video, frases)
    print(f"✓ {video['id']}: {len(frases):,} frases, {len(paraules):,} paraules → {cami}", flush=True)
    return video["id"]


def transcriu(args: argparse.Namespace) -> None:
    if not os.environ.get("ASSEMBLYAI_API_KEY"):
        raise SystemExit("❌ Falta ASSEMBLYAI_API_KEY (al repositori: Settings → Secrets and variables → Actions).")
    if args.minuts and Path(args.carpeta).resolve() == FRASES.resolve():
        raise SystemExit("❌ Amb --minuts cal --carpeta: un vídeo a mitges a frases/ ja no es tornaria a fer sencer.")
    urls = list(args.url or [])
    if args.pendents:
        urls += [v["url"] for v in pendents()]
    if args.max:
        urls = urls[: args.max]
    if args.audio and len(urls) != 1:
        raise SystemExit("❌ --audio va amb una sola --url (la del vídeo de YouTube d'on surt).")
    if not urls:
        print("No hi ha cap vídeo per transcriure.")
        sessio.escriu_output({"fets": 0})
        return

    print(f"Transcrivint {len(urls)} vídeo(s), {args.parallel} alhora. Una partida de 4 h tarda uns 15 minuts…", flush=True)

    def un(url: str) -> str | None:
        try:
            return transcriu_video(url, args)
        except (Exception, SystemExit) as exc:  # un vídeo que falla no atura els altres
            print(f"❌ {url}: {exc}", flush=True)
            return None

    with ThreadPoolExecutor(max_workers=max(1, args.parallel)) as pool:
        resultats = list(pool.map(un, urls))
    fets = [r for r in resultats if r]
    sessio.escriu_output({"fets": len(fets)})
    print(f"\n{len(fets)} de {len(urls)} vídeo(s) transcrits.")
    if len(fets) < len(urls):
        sys.exit(1)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="ordre", required=True)

    sub.add_parser("pendents", help="llista els vídeos del canal que encara no tenen frases")

    t = sub.add_parser("transcriu", help="transcriu vídeos de YouTube a frases/<id>.json")
    t.add_argument("--url", action="append", help="vídeo de YouTube (es pot repetir)")
    t.add_argument("--pendents", action="store_true", help="tots els vídeos del canal que encara no hi són")
    t.add_argument("--max", type=int, help="com a molt, N vídeos")
    t.add_argument("--audio", help="fitxer d'àudio o vídeo local del vídeo de --url")
    t.add_argument("--idioma", default="ca")
    t.add_argument("--minuts", type=int, help="només els primers N minuts (per provar barat; cal --carpeta)")
    t.add_argument("--carpeta", default=str(FRASES), help="on es desen (per defecte frases/)")
    t.add_argument("--parallel", type=int, default=3, help="quants vídeos alhora (per defecte 3)")

    args = p.parse_args()
    if args.ordre == "pendents":
        llista = pendents()
        print(json.dumps(llista, ensure_ascii=False, indent=2))
        sessio.escriu_output({"pendents": len(llista)})
    else:
        if not (args.url or args.pendents):
            p.error("transcriu necessita --url o --pendents")
        transcriu(args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

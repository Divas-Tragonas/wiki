#!/usr/bin/env python3
"""
Sessions noves: trobar el vídeo d'una partida i transcriure'l.

El fa servir el workflow `.github/workflows/nova-sessio.yml`, però també es pot fer anar a mà:

  python scripts/nova-sessio/sessio.py detecta                      # mira el canal de Twitch
  python scripts/nova-sessio/sessio.py detecta --url <vídeo>        # un vídeo concret (Twitch o YouTube)
  python scripts/nova-sessio/sessio.py transcriu --url <vídeo> --sessio 12 --titol "…" --data 2026-11-01
  python scripts/nova-sessio/sessio.py transcriu --audio partida.mp4 --sessio 12 --titol "…" --data 2026-11-01

`transcriu` necessita ASSEMBLYAI_API_KEY i ffmpeg. Per a YouTube potser calen galetes
(YTDLP_COOKIES_FILE, fitxer en format Netscape), perquè YouTube bloqueja els servidors de GitHub.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
CRONIQUES = ROOT / "src" / "content" / "croniques"
TRANSCRIPTS = ROOT / "transcripts"
CANAL = "https://www.twitch.tv/divasytragonas/videos?filter=archives&sort=time"
ZONA = ZoneInfo("Europe/Madrid")
# «D&D SESSIÓ 12 - AGATHA, AGARRAME ESTA!» → 12 i «AGATHA, AGARRAME ESTA!»
TITOL_SESSIO = re.compile(r"SESSI[ÓO]\s*(\d+)\s*(?:[-–—:|]\s*(.*))?", re.IGNORECASE)


# ── Què hi ha ja a la wiki ──────────────────────────────────────────────

def sessions_amb_cronica() -> set[int]:
    nums = set()
    for f in CRONIQUES.glob("*.md"):
        m = re.search(r"^session:\s*(\d+)", f.read_text(encoding="utf-8"), re.MULTILINE)
        if m:
            nums.add(int(m.group(1)))
    return nums


def sessions_amb_transcripcio() -> set[int]:
    return {int(m.group(1)) for f in TRANSCRIPTS.glob("sessio-*.txt") if (m := re.fullmatch(r"sessio-(\d+)\.txt", f.name))}


def sessions_amb_pr() -> set[int]:
    """Sessions que ja tenen PR (obert per revisar, o tancat perquè algú l'ha descartat).

    Una branca `sessio-N` sense PR vol dir que la feina es va quedar a mitges: es torna a provar
    (la transcripció, si ja hi és, no es repeteix)."""
    try:
        out = subprocess.run(
            ["gh", "pr", "list", "--state", "all", "--limit", "200", "--json", "headRefName", "--jq", ".[].headRefName"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return set()
    return {int(m.group(1)) for m in re.finditer(r"^sessio-(\d+)$", out, re.MULTILINE)}


def seguent_sessio() -> int:
    return max(sessions_amb_cronica() | sessions_amb_transcripcio() | {0}) + 1


# ── Vídeos ──────────────────────────────────────────────────────────────

def ydl_opts(extra: dict | None = None) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        # YouTube demana resoldre un repte en JavaScript; Node ja hi és als runners de GitHub
        "js_runtimes": {"node": {}},
    }
    cookies = os.environ.get("YTDLP_COOKIES_FILE")
    if cookies and Path(cookies).is_file():
        opts["cookiefile"] = cookies
    opts.update(extra or {})
    return opts


def info_video(url: str) -> dict:
    import yt_dlp

    with yt_dlp.YoutubeDL(ydl_opts()) as ydl:
        return ydl.extract_info(url, download=False)


def data_video(info: dict) -> str:
    ts = info.get("release_timestamp") or info.get("timestamp")
    if ts:
        return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(ZONA).date().isoformat()
    if info.get("upload_date"):
        d = info["upload_date"]
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return date.today().isoformat()


def descriu(info: dict, url: str) -> dict:
    titol_video = (info.get("title") or "").strip()
    m = TITOL_SESSIO.search(titol_video)
    sessio = int(m.group(1)) if m else seguent_sessio()
    titol = (m.group(2) or "").strip() if m else ""
    return {
        "url": info.get("webpage_url") or url,
        "titol_video": titol_video,
        "sessio": sessio,
        "titol": titol or titol_video,
        "data": data_video(info),
        "durada": int(info.get("duration") or 0),
        "branca": f"sessio-{sessio}",
    }


def detecta(url: str | None) -> dict:
    """Retorna la sessió a processar, o {"pendent": False}."""
    if url:
        return {"pendent": True, **descriu(info_video(url), url)}

    import yt_dlp

    with yt_dlp.YoutubeDL(ydl_opts({"extract_flat": True})) as ydl:
        canal = ydl.extract_info(CANAL, download=False)

    fetes = sessions_amb_cronica()
    ocupades = fetes | sessions_amb_transcripcio() | sessions_amb_pr()
    ultima = max(fetes | {0})
    candidats = []
    for e in canal.get("entries") or []:
        m = TITOL_SESSIO.search(e.get("title") or "")
        if not m:
            continue
        n = int(m.group(1))
        if n > ultima and n not in ocupades:
            candidats.append((n, e.get("url") or e.get("webpage_url")))
    if not candidats:
        return {"pendent": False}
    # d'una en una i per ordre: la crònica de la 13 ha de saber què va passar a la 12
    n, url = min(candidats)
    return {"pendent": True, **descriu(info_video(url), url)}


# ── Transcripció ────────────────────────────────────────────────────────

def baixa_audio(url: str, carpeta: Path, minuts: int | None) -> Path:
    import yt_dlp

    extra = {
        "format": "Audio_Only/bestaudio/best",
        "outtmpl": str(carpeta / "original.%(ext)s"),
        "quiet": False,
        "noprogress": True,
    }
    if minuts:
        from yt_dlp.utils import download_range_func

        extra["download_ranges"] = download_range_func(None, [(0, minuts * 60)])
    print(f"▶ Baixant l'àudio de {url}", flush=True)
    with yt_dlp.YoutubeDL(ydl_opts(extra)) as ydl:
        ydl.download([url])
    fitxers = list(carpeta.glob("original.*"))
    if not fitxers:
        raise SystemExit("❌ yt-dlp no ha baixat res. El vídeo és públic? Els de Twitch caduquen al cap d'unes setmanes.")
    return fitxers[0]


def a_mp3(entrada: Path, carpeta: Path, minuts: int | None) -> Path:
    """Mono, 16 kHz, 48 kbps: una partida de 5 h fa uns 100 MB i AssemblyAI no hi perd res."""
    sortida = carpeta / "audio.mp3"
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(entrada)]
    if minuts:
        cmd += ["-t", str(minuts * 60)]
    cmd += ["-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", str(sortida)]
    subprocess.run(cmd, check=True)
    print(f"  Àudio: {sortida.stat().st_size / 1024 / 1024:.0f} MB", flush=True)
    return sortida


def hms(ms: int) -> str:
    s = ms // 1000
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def transcriu_audio(audio: Path, idioma: str) -> tuple[str, int]:
    import assemblyai as aai

    aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
    model = os.environ.get("ASSEMBLYAI_MODEL", "universal-2")
    print(f"▶ Transcrivint amb AssemblyAI ({model}, {idioma}). Una partida de 4 h tarda uns 15 minuts…", flush=True)
    config = aai.TranscriptionConfig(speech_models=[model], language_code=idioma, punctuate=True, format_text=True)
    t = aai.Transcriber(config=config).transcribe(str(audio))
    if t.status == aai.TranscriptStatus.error:
        raise SystemExit(f"❌ AssemblyAI: {t.error}")
    text = t.text or ""
    # Paràgrafs amb l'hora del vídeo, per poder-hi anar a comprovar coses
    try:
        cos = "\n\n".join(f"[{hms(p.start)}] {p.text}" for p in t.get_paragraphs())
    except Exception as exc:  # els paràgrafs són un extra: si fallen, el text sencer serveix igual
        print(f"  (sense paràgrafs: {exc})", flush=True)
        cos = text
    return cos or text, len(text.split())


def transcriu(args: argparse.Namespace) -> None:
    if not os.environ.get("ASSEMBLYAI_API_KEY"):
        raise SystemExit("❌ Falta ASSEMBLYAI_API_KEY (al repositori: Settings → Secrets and variables → Actions).")
    sortida = Path(args.out or TRANSCRIPTS / f"sessio-{args.sessio}.txt")
    with tempfile.TemporaryDirectory(prefix="sessio-") as tmp:
        carpeta = Path(tmp)
        original = Path(args.audio) if args.audio else baixa_audio(args.url, carpeta, args.minuts)
        cos, paraules = transcriu_audio(a_mp3(original, carpeta, args.minuts), args.idioma)

    capcalera = [
        f"# Sessió {args.sessio}" + (f": {args.titol}" if args.titol else ""),
        f"# Data: {args.data}",
    ]
    if args.url:
        capcalera.append(f"# VOD: {args.url}")
    capcalera.append(f"# Idioma: {args.idioma}")
    if args.minuts:
        capcalera.append(f"# PROVA: només els primers {args.minuts} minuts")
    sortida.parent.mkdir(parents=True, exist_ok=True)
    sortida.write_text("\n".join(capcalera) + "\n\n" + cos + "\n", encoding="utf-8")
    nom = str(sortida.resolve().relative_to(ROOT)) if sortida.resolve().is_relative_to(ROOT) else str(sortida)
    print(f"✓ {nom}: {paraules:,} paraules", flush=True)
    escriu_output({"paraules": paraules, "fitxer": nom})


# ── Sortida per al workflow ─────────────────────────────────────────────

def escriu_output(dades: dict) -> None:
    fitxer = os.environ.get("GITHUB_OUTPUT")
    if not fitxer:
        return
    with open(fitxer, "a", encoding="utf-8") as f:
        for k, v in dades.items():
            v = json.dumps(v) if isinstance(v, bool) else str(v)
            f.write(f"{k}={v.replace(chr(10), ' ')}\n")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="ordre", required=True)

    d = sub.add_parser("detecta", help="troba la sessió següent al canal de Twitch, o descriu un vídeo")
    d.add_argument("--url", help="vídeo concret (Twitch o YouTube); sense, es mira el canal")

    t = sub.add_parser("transcriu", help="baixa l'àudio i el transcriu a transcripts/sessio-N.txt")
    font = t.add_mutually_exclusive_group(required=True)
    font.add_argument("--url", help="vídeo de Twitch o YouTube")
    font.add_argument("--audio", help="fitxer d'àudio o vídeo local")
    t.add_argument("--sessio", type=int, required=True)
    t.add_argument("--titol", default="")
    t.add_argument("--data", default=date.today().isoformat())
    t.add_argument("--idioma", default="ca")
    t.add_argument("--minuts", type=int, help="només els primers N minuts (per provar barat)")
    t.add_argument("--out", help="fitxer de sortida (per defecte transcripts/sessio-N.txt)")

    args = p.parse_args()
    if args.ordre == "detecta":
        res = detecta(args.url)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        escriu_output(res)
    else:
        transcriu(args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

#!/bin/bash
# Actualitza l'API de missions a la Mac mini (Ubuntu). El repositori el manté al dia l'autofetch; aquest script es
# crida després de cada fetch (o cada pocs minuts, amb missions-update.timer) com a usuari `missions`: si no hi ha res
# de nou a l'API, no fa res.
#
# Cada versió es construeix a $MISSIONS_HOME/releases/<commit>, es proven els tests, s'aplica cap migració pendent,
# s'engega de prova en un altre port i, si respon, el servei hi passa (enllaç `current`). Si després no respon, torna a
# l'anterior. Una versió que falla no es torna a provar fins que hi hagi un commit nou (o FORCE=1).
#
# Variables (totes opcionals):
#   MISSIONS_REPO   el repositori (per defecte, el d'aquest script)
#   MISSIONS_HOME   on viuen les versions, el .env i el registre (per defecte /opt/missions-api)
#   SERVICE         el servei de systemd (per defecte missions-api)
#   RESTART_CMD     ordre per reiniciar el servei (per defecte systemctl restart, amb sudo si no s'és root)
#   SKIP_TESTS=1    no passar els tests abans d'activar la versió
#   FORCE=1         reconstruir encara que ja estigui desplegada (o hagi fallat)
#   PREFLIGHT_PORT  port per a l'engegada de prova (per defecte, PORT + 1000)
set -euo pipefail

REPO="${MISSIONS_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
HOME_DIR="${MISSIONS_HOME:-/opt/missions-api}"
SERVICE="${SERVICE:-missions-api}"
ENV_FILE="$HOME_DIR/.env"
KEEP=5

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [missions-api] $*"; }
fail() { log "ERROR: $*"; exit 1; }
# la versió no serveix: s'apunta perquè la propera crida no la torni a provar
reject() { echo "$SHA" > "$HOME_DIR/failed"; fail "$*"; }

[ -f "$ENV_FILE" ] || fail "falta $ENV_FILE (copia deploy/macmini/env.example i omple-la)"
mkdir -p "$HOME_DIR/releases" "$HOME_DIR/logs"

# una sola actualització alhora
LOCK="$HOME_DIR/.update.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  log "ja hi ha una actualització en marxa"
  exit 0
fi
trap 'rmdir "$LOCK"' EXIT

# el clon és d'un altre usuari (el de l'autofetch): sense safe.directory git no hi vol treballar
git_repo() { git -c safe.directory="$REPO" -C "$REPO" "$@"; }

SHA=$(git_repo rev-parse HEAD)
DEPLOYED=$(cat "$HOME_DIR/deployed" 2>/dev/null || true)
if [ "$SHA" = "$DEPLOYED" ] && [ -z "${FORCE:-}" ]; then exit 0; fi
if [ "$SHA" = "$(cat "$HOME_DIR/failed" 2>/dev/null || true)" ] && [ -z "${FORCE:-}" ]; then exit 0; fi
if [ -n "$DEPLOYED" ] && [ -z "${FORCE:-}" ] && git_repo cat-file -e "$DEPLOYED^{commit}" 2>/dev/null \
  && git_repo diff --quiet "$DEPLOYED" "$SHA" -- api packages package.json package-lock.json; then
  log "commit ${SHA:0:7}: res de nou per a l'API"
  echo "$SHA" > "$HOME_DIR/deployed"
  exit 0
fi

log "construint ${SHA:0:7}"
REL="$HOME_DIR/releases/$SHA"
[ -d "$REL" ] && rm -rf "$REL"
mkdir -p "$REL"
git_repo archive "$SHA" api packages package.json package-lock.json | tar -x -C "$REL"
(
  cd "$REL"
  npm ci --workspace=@mina/api --include-workspace-root=false --no-audit --no-fund --loglevel=error
  npm run build --workspace=@mina/api --silent
  if [ -z "${SKIP_TESTS:-}" ]; then npm test --workspace=@mina/api --silent; fi
) || reject "la versió ${SHA:0:7} no s'ha pogut construir o no passa els tests: es queda la que hi havia"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
PORT="${PORT:-8787}"
PREFLIGHT_PORT="${PREFLIGHT_PORT:-$((PORT + 1000))}"

log "migracions"
node "$REL/api/dist/cli.js" migrate || reject "les migracions han fallat: es queda la versió que hi havia"

restart() {
  if [ -n "${RESTART_CMD:-}" ]; then eval "$RESTART_CMD"
  elif [ "$(id -u)" = 0 ]; then systemctl restart "$SERVICE"
  else sudo -n /usr/bin/systemctl restart "$SERVICE"; fi
}
# healthy [port] [pid]: respon en 30 s (amb pid, plega de seguida si el procés s'ha aturat)
healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${1:-$PORT}/healthz" >/dev/null 2>&1; then return 0; fi
    if [ -n "${2:-}" ] && ! kill -0 "$2" 2>/dev/null; then return 1; fi
    sleep 1
  done
  return 1
}

# engegada de prova en un altre port: si la versió no arrenca, el servei no s'ha aturat
log "prova d'engegada al port $PREFLIGHT_PORT"
PORT="$PREFLIGHT_PORT" LOG_REQUESTS=0 node "$REL/api/dist/server.js" > "$HOME_DIR/logs/preflight.log" 2>&1 &
PREFLIGHT_PID=$!
if ! healthy "$PREFLIGHT_PORT" "$PREFLIGHT_PID"; then
  kill "$PREFLIGHT_PID" 2>/dev/null || true
  reject "la versió ${SHA:0:7} no arrenca (vegeu logs/preflight.log): es queda la que hi havia"
fi
kill "$PREFLIGHT_PID" 2>/dev/null || true
wait "$PREFLIGHT_PID" 2>/dev/null || true

PREV=$(readlink "$HOME_DIR/current" 2>/dev/null || true)
ln -sfn "$REL" "$HOME_DIR/current"
restart
if ! healthy; then
  log "la versió ${SHA:0:7} no respon: torno a ${PREV:+$(basename "$PREV" | cut -c1-7)}"
  echo "$SHA" > "$HOME_DIR/failed"
  if [ -n "$PREV" ]; then
    ln -sfn "$PREV" "$HOME_DIR/current"
    restart
    healthy || log "ATENCIÓ: l'anterior tampoc no respon"
  fi
  exit 1
fi
echo "$SHA" > "$HOME_DIR/deployed"
rm -f "$HOME_DIR/failed"
log "en marxa: ${SHA:0:7}"

# es queden les $KEEP versions més noves (i la que està en marxa)
CURRENT=$(readlink "$HOME_DIR/current")
ls -1t "$HOME_DIR/releases" | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$HOME_DIR/releases/$old" = "$CURRENT" ] || rm -rf "${HOME_DIR:?}/releases/${old:?}"
done

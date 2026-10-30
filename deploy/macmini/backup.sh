#!/bin/bash
# Còpia de cada nit: còpia dins de la base de dades i neteja (cli nightly), exportació JSON (es pot importar des del
# tauler o amb la CLI) i, si la base de dades és Postgres, un pg_dump. Es guarden 30 dies a $MISSIONS_HOME/backups;
# amb RCLONE_REMOTE al .env (p. ex. r2:missions-backups) també es copien fora de la Mac mini.
set -euo pipefail

HOME_DIR="${MISSIONS_HOME:-/opt/missions-api}"
set -a
# shellcheck disable=SC1090
. "$HOME_DIR/.env"
set +a
CLI="$HOME_DIR/current/api/dist/cli.js"
DIR="$HOME_DIR/backups"
STAMP=$(date +%Y-%m-%d)
mkdir -p "$DIR"

node "$CLI" nightly
node "$CLI" export "$DIR/missions-$STAMP.json"
case "$DATABASE_URL" in
  postgres://*|postgresql://*) pg_dump "$DATABASE_URL" --format=custom --file "$DIR/missions-$STAMP.dump" ;;
esac
find "$DIR" -name 'missions-*' -mtime +30 -delete
if [ -n "${RCLONE_REMOTE:-}" ]; then rclone copy "$DIR" "$RCLONE_REMOTE" --max-age 48h; fi
echo "$(date '+%Y-%m-%d %H:%M:%S') [missions-api] còpia feta: $DIR/missions-$STAMP.*"

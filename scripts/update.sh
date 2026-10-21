#!/bin/sh
# Update GianniGym in one command:  sudo giannigym-update
#
# 1. backs up data/ (scripts/backup.sh), 2. pulls the latest code as the repo's owner,
# 3. rebuilds and restarts the containers (with the Caddy HTTPS proxy when DOMAIN is set),
# 4. waits for the API to answer, 5. removes the old images so the disk does not fill up.
#
#   giannigym-update            update if there is anything new
#   giannigym-update --force    rebuild even when the code did not change
#   DRY_RUN=1 giannigym-update  print what would run
set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$(readlink -f "$0")")/.." && pwd)
FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1
run() { if [ "${DRY_RUN:-0}" = 1 ]; then echo "+ $*"; else "$@"; fi; }

if [ "$(id -u)" != 0 ] && [ "${DRY_RUN:-0}" != 1 ]; then exec sudo "$0" "$@"; fi
cd "$ROOT"

# git refuses to work in a repo owned by someone else ("dubious ownership"), so it runs as
# the owner of the checkout — opc on the Oracle image — while docker runs as root.
OWNER=$(stat -c %U "$ROOT")
as_owner() { if [ "$(id -un)" = "$OWNER" ]; then "$@"; else run sudo -u "$OWNER" "$@"; fi; }

COMPOSE="docker compose -f docker-compose.yml"
if [ -f docker-compose.caddy.yml ] && grep -q '^DOMAIN=.' .env 2>/dev/null; then
  COMPOSE="$COMPOSE -f docker-compose.caddy.yml"
fi
PORT=$(sed -n 's/^WEB_PORT=//p' .env 2>/dev/null | tail -n1); PORT=${PORT:-8080}

echo "== backup"
if [ -d data ]; then run sh scripts/backup.sh; else echo "no data/ yet, skipping"; fi

echo "== code"
BEFORE=$(git rev-parse --short HEAD)
as_owner git pull --ff-only
AFTER=$(git rev-parse --short HEAD)
if [ "$BEFORE" = "$AFTER" ] && [ "$FORCE" = 0 ]; then
  echo "already up to date ($AFTER). Use --force to rebuild anyway."
  exit 0
fi
echo "$BEFORE -> $AFTER"
git log --oneline "$BEFORE..$AFTER" 2>/dev/null | sed 's/^/   /' | head -20 || true

echo "== rebuild"
# shellcheck disable=SC2086
run $COMPOSE up -d --build

echo "== health"
if [ "${DRY_RUN:-0}" = 1 ]; then echo "+ curl http://127.0.0.1:$PORT/api/health"; else
  ok=0
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  if [ "$ok" = 1 ]; then echo "API answering on :$PORT"; else
    echo "API not answering after 60 s — check: $COMPOSE logs --tail=50 api" >&2; exit 1
  fi
fi

echo "== cleanup"
run docker image prune -f >/dev/null
echo "done: GianniGym is at $AFTER"

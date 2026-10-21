#!/bin/sh
# Daily copy of GianniGym's data folder (profiles, passkeys, every user's workouts).
#
#   sudo /opt/giannigym/scripts/backup.sh            # run by hand
#   scripts/server-setup.sh schedules it every night
#
# Keeps the last KEEP archives (default 14) in BACKUP_DIR (default <repo>/backups), plus a
# `latest.tgz` link. This protects against a bad update or a corrupted file. It does NOT
# protect against losing the whole server: copy an archive elsewhere now and then, e.g.
#   scp -i <key> opc@<server>:/opt/giannigym/backups/latest.tgz ~/Desktop/
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DATA=${DATA_DIR:-$ROOT/data}
DEST=${BACKUP_DIR:-$ROOT/backups}
KEEP=${KEEP:-14}

[ -d "$DATA" ] || { echo "no data folder at $DATA" >&2; exit 1; }
mkdir -p "$DEST"
chmod 700 "$DEST"

STAMP=$(date +%Y-%m-%d_%H%M)
OUT="$DEST/giannigym-$STAMP.tgz"
TMP="$OUT.part"

# The Codex sign-in cache is a credential, not training data: it stays out of the archive.
tar -czf "$TMP" -C "$(dirname "$DATA")" --exclude="$(basename "$DATA")/codex" "$(basename "$DATA")"
gzip -t "$TMP"                      # refuse to keep an archive that does not read back
mv "$TMP" "$OUT"
chmod 600 "$OUT"
ln -sf "$(basename "$OUT")" "$DEST/latest.tgz"

# Rotation: newest first, drop everything after the first KEEP.
ls -1t "$DEST"/giannigym-*.tgz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old"; done

echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1)), keeping $KEEP"

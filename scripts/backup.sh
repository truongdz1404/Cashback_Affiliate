#!/usr/bin/env bash
#
# Nightly snapshot of everything on this box that git cannot rebuild.
#
# The database is the obvious half. The other half is three docker volumes:
# `session` holds the Shopee login, so losing it means signing in by hand again,
# and `bank-logos` / `banner-uploads` hold artwork uploaded through the admin
# dashboard that exists in no other place. The rabbitmq volume is skipped on
# purpose - it is a work queue, and restoring a stale queue is worse than
# starting from an empty one.
#
# Keeping copies HERE only survives a bad migration or a dropped table. It does
# nothing about the box itself dying, which is the failure this was written for,
# so an off-site copy is the point and not an extra: set BACKUP_REMOTE to an
# rclone destination. Without it the script still runs, but it exits non-zero so
# cron mails you instead of leaving you with a backup that dies with its server.
#
# Usage:
#   scripts/backup.sh                      # dump, verify, rotate, upload
#   BACKUP_REMOTE=r2:shopee-backup ...     # off-site destination (rclone)
#   KEEP_DAYS=14 scripts/backup.sh         # override retention
#
# Restore (the reason any of this exists):
#   gunzip -c db_2026-09-25.dump.gz > /tmp/db.dump
#   docker exec -i shopee-affiliate-db pg_restore -U USER -d DB --clean --if-exists < /tmp/db.dump
#   docker run --rm -v shopee-affiliate_shopee-affiliate-session:/dst \
#     -v "$PWD":/src alpine tar xzf /src/session_2026-09-25.tgz -C /dst

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/shopee-affiliate}"
DEST="${BACKUP_DIR:-/var/backups/shopee-affiliate}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DB_CONTAINER="${DB_CONTAINER:-shopee-affiliate-db}"
STAMP="$(date -u +%F_%H%M)"

# The volumes worth keeping, named as docker sees them (compose prefixes the
# project directory). rabbitmq-data is absent by design - see the header.
VOLUMES="session bank-logos banner-uploads"
VOL_PREFIX="shopee-affiliate_shopee-affiliate-"

log() { printf '[backup %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "LOI: $*" >&2; exit 1; }

mkdir -p "$DEST"

# Credentials live in the compose env file and nowhere else. Sourcing it rather
# than hardcoding means a rotated password never silently breaks the backups -
# the thing you only find out about on the day you need to restore.
[ -f "$COMPOSE_DIR/.env" ] || die "khong thay $COMPOSE_DIR/.env"
# shellcheck disable=SC1091
set -a; . "$COMPOSE_DIR/.env"; set +a
: "${POSTGRES_USER:?POSTGRES_USER trong .env}"
: "${POSTGRES_DB:?POSTGRES_DB trong .env}"

docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "container $DB_CONTAINER khong chay"

# -Fc (custom format) over plain SQL: it compresses, and pg_restore can pull a
# single table out of it. A gzipped .sql is all-or-nothing at restore time.
DUMP="$DEST/db_$STAMP.dump"
log "dump database..."
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DUMP"

# A dump that cannot be read is not a backup, and the day you discover that is
# the worst possible day. pg_restore --list walks the archive's table of
# contents, so a truncated or corrupt file fails here rather than in an outage.
log "kiem tra dump doc duoc..."
docker exec -i "$DB_CONTAINER" pg_restore --list < "$DUMP" >/dev/null \
  || die "dump hong - KHONG dung duoc de khoi phuc"
DUMP_SIZE="$(du -h "$DUMP" | cut -f1)"
log "db OK ($DUMP_SIZE)"

for v in $VOLUMES; do
  full="${VOL_PREFIX}${v}"
  docker volume inspect "$full" >/dev/null 2>&1 || { log "bo qua volume $full (khong ton tai)"; continue; }
  docker run --rm -v "$full":/src:ro -v "$DEST":/dst alpine \
    tar czf "/dst/${v}_$STAMP.tgz" -C /src . 2>/dev/null
  log "volume $v OK ($(du -h "$DEST/${v}_$STAMP.tgz" | cut -f1))"
done

# Rotate before uploading, so the remote mirror ends up with the same retention
# without needing a second rule over there.
find "$DEST" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.tgz' \) \
  -mtime "+$KEEP_DAYS" -print -delete | sed 's/^/[backup] xoa cu: /'

if [ -n "${BACKUP_REMOTE:-}" ]; then
  command -v rclone >/dev/null || die "BACKUP_REMOTE dat roi nhung chua cai rclone"
  log "day len $BACKUP_REMOTE ..."
  rclone sync "$DEST" "$BACKUP_REMOTE" --stats-one-line --stats=0
  log "da dong bo off-site"
else
  log "tong: $(du -sh "$DEST" | cut -f1) tai $DEST"
  die "CHUA DAT BACKUP_REMOTE - ban sao chi nam tren chinh con VPS nay, VPS chet la mat theo"
fi

log "xong"

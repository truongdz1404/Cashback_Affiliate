#!/usr/bin/env bash
#
# Makes a box able to back itself up. Run from the deploy, every time, on
# purpose: it is written to be boring to repeat, so that standing up a
# replacement VPS is `git pull` plus the deploy, and not an afternoon of
# remembering what was configured by hand on the old one.
#
# What it does NOT do is hold the credentials. The R2 key pair arrives in the
# environment from GitHub Secrets; everything else - which bucket, which
# endpoint, what time - is not secret and lives in git where a new box can read
# it. Without the key pair this exits 0 and says so: a deploy should not fail
# because backups are not wired up yet, it should tell you they are not.

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/shopee-affiliate}"
REMOTE_NAME="${REMOTE_NAME:-r2}"
R2_ENDPOINT="${R2_ENDPOINT:-https://19d1a6fc390d64ff107f7c75f0ea76a5.r2.cloudflarestorage.com}"
# 20:00 UTC is 03:00 in Vietnam, where the people who would have to read the
# failure mail are asleep and the box is doing the least.
CRON_SCHEDULE="${CRON_SCHEDULE:-0 20 * * *}"
CRON_MARKER='scripts/backup.sh'

log() { printf '[provision %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  log "BO QUA: chua co R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY trong GitHub Secrets"
  log "         backup van chay nhung chi luu tren chinh VPS nay"
  exit 0
fi

if ! command -v rclone >/dev/null; then
  log "cai rclone..."
  apt-get update -qq && apt-get install -y -qq rclone
fi

# `config create` replaces a remote of the same name, so re-running is a no-op
# in effect. rclone obscures the secret on the way into its config file, which
# is why the key never appears here in plaintext at rest.
log "cau hinh remote '$REMOTE_NAME'..."
rclone config create "$REMOTE_NAME" s3 \
  provider=Cloudflare region=auto acl=private \
  access_key_id="$R2_ACCESS_KEY_ID" \
  secret_access_key="$R2_SECRET_ACCESS_KEY" \
  endpoint="$R2_ENDPOINT" >/dev/null

# Proves the credentials work now, rather than at 3am in a cron job nobody reads.
rclone lsd "$REMOTE_NAME": >/dev/null || { log "LOI: khong xac thuc duoc voi R2"; exit 1; }
log "xac thuc R2 OK"

# Rewriting the whole crontab is the only way to make an entry idempotent: strip
# any line mentioning the script, then add the one we want back.
if ! crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
  log "cai cron hang ngay ($CRON_SCHEDULE UTC)..."
else
  log "cap nhat cron ($CRON_SCHEDULE UTC)..."
fi
{
  crontab -l 2>/dev/null | grep -v "$CRON_MARKER" || true
  echo "$CRON_SCHEDULE cd $COMPOSE_DIR && bash scripts/backup.sh >> /var/log/shopee-backup.log 2>&1"
} | crontab -

log "xong"

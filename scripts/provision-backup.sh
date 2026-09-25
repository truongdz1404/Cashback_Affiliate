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
# Must stay in step with the default in backup.sh: this is the exact path we
# prove we can write to, so that what gets verified is what gets used.
BACKUP_REMOTE="${BACKUP_REMOTE:-r2:rewally/shopee-affiliate}"
# Ubuntu 24.04 ships 1.60, from 2022, which is too old to talk to R2 cleanly.
RCLONE_MIN="${RCLONE_MIN:-1.65}"

log() { printf '[provision %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  log "BO QUA: chua co R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY trong GitHub Secrets"
  log "         backup van chay nhung chi luu tren chinh VPS nay"
  exit 0
fi

# The distro package answers 501 NotImplemented to R2 on the first attempt of
# every upload and only lands on the retry. It does eventually work, which is
# the dangerous part: a backup failing half its requests looks fine until the
# night it doesn't. So we take rclone's own build, after checking its checksum.
have="$(rclone version 2>/dev/null | head -1 | awk '{print $2}' | tr -d v)"
if [ -z "$have" ] || [ "$(printf '%s\n%s\n' "$RCLONE_MIN" "$have" | sort -V | head -1)" != "$RCLONE_MIN" ]; then
  log "cai rclone (dang co: ${have:-khong co}, can >= $RCLONE_MIN)..."
  V="$(curl -fsSL https://downloads.rclone.org/version.txt)"; V="${V#rclone }"
  PKG="rclone-${V}-linux-amd64.deb"
  TMP="$(mktemp -d)"
  (
    cd "$TMP" &&
    curl -fsSLO "https://downloads.rclone.org/$V/$PKG" &&
    curl -fsSLO "https://downloads.rclone.org/$V/SHA256SUMS" &&
    grep "$PKG" SHA256SUMS | sha256sum -c - &&
    dpkg -i "$PKG" >/dev/null
  ) || { rm -rf "$TMP"; log "LOI: khong cai duoc rclone"; exit 1; }
  rm -rf "$TMP"
  hash -r
  log "rclone $(rclone version | head -1 | awk '{print $2}')"
fi

# `config create` replaces a remote of the same name, so re-running is a no-op
# in effect. The secret does land in rclone.conf in the clear - rclone only
# obscures when asked, and its obscuring is reversible with `rclone reveal`
# anyway, so it would buy nothing. What protects it is the file mode: 0600,
# root only, on a box where root is already the deploy user.
#
# no_check_bucket is not optional here. Without it rclone confirms the bucket
# exists before its first upload, which a token scoped to object permissions is
# not allowed to ask - so every write comes back 403 AccessDenied and the token
# looks broken when it is perfectly good. Cloudflare's own rclone guide calls
# this out for exactly this kind of token.
log "cau hinh remote '$REMOTE_NAME'..."
rclone config create "$REMOTE_NAME" s3 \
  provider=Cloudflare region=auto acl=private \
  access_key_id="$R2_ACCESS_KEY_ID" \
  secret_access_key="$R2_SECRET_ACCESS_KEY" \
  endpoint="$R2_ENDPOINT" \
  no_check_bucket=true >/dev/null

# Proves the credentials work now, rather than at 3am in a cron job nobody reads.
#
# By writing and deleting a real object at the real destination, not by listing.
# `rclone lsd r2:` asks for every bucket on the account, which a token scoped to
# one bucket is never allowed to do - so it returns 403 for a perfectly good
# token and sends you looking for a key that was right all along. A list also
# says nothing about write access, which is the whole point. This asks the one
# question that matters: can tonight's backup land where it is meant to.
#
# It uploads a real file the way the backup does, rather than streaming with
# `rcat`: R2 answers 501 to the streaming path, so a probe built on it would
# fail for a reason the nightly run never meets.
PROBE="$BACKUP_REMOTE/.provision-check"
ERR="$(mktemp)"
TMPF="$(mktemp)"
printf 'ok\n' >"$TMPF"
if ! rclone copyto "$TMPF" "$PROBE" 2>"$ERR"; then
  log "LOI: khong ghi duoc vao $BACKUP_REMOTE"
  sed -n '1,4p' "$ERR" | sed 's/^/[provision]     /'
  log "      token R2 phai la 'Object Read & Write' va tro dung bucket"
  rm -f "$ERR" "$TMPF"
  exit 1
fi
rm -f "$ERR" "$TMPF"

# Deleting the probe is also a test. The nightly upload is `rclone sync`, which
# has to remove what rotation dropped locally; a token that can write but not
# delete would pass the check above and then fail every night. Not fatal - the
# copies still arrive - but it must not pass silently.
if ! rclone deletefile "$PROBE" >/dev/null 2>&1; then
  log "CANH BAO: ghi duoc nhung khong xoa duoc - rclone sync se loi khi xoay vong"
fi
log "xac thuc R2 OK - ghi duoc vao $BACKUP_REMOTE"

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

#!/usr/bin/env bash
# Runs the service under Xvfb so Chromium launches "headed" (HEADLESS=false)
# even on a Linux box with no physical display - needed because the plain
# headless flag is what Shopee Shield fingerprints and blocks.
#
# Deliberately does NOT use the `xvfb-run` wrapper: it waits for Xvfb's
# readiness via a SIGUSR1 handshake that reliably never arrives when this
# script runs as PID 1 in a container, so it hangs forever before ever
# starting node. Instead, start Xvfb directly and poll for its socket.
#
# Requires: sudo apt-get install -y xvfb  (Debian/Ubuntu)
set -euo pipefail
cd "$(dirname "$0")/.."

DISPLAY_NUM=99
export DISPLAY=":$DISPLAY_NUM"
export HEADLESS=false

Xvfb "$DISPLAY" -screen 0 1920x1080x24 -nolisten tcp &

for _ in $(seq 1 50); do
  [ -e "/tmp/.X11-unix/X$DISPLAY_NUM" ] && break
  sleep 0.2
done
[ -e "/tmp/.X11-unix/X$DISPLAY_NUM" ] || { echo "Xvfb failed to start" >&2; exit 1; }

npx prisma migrate deploy

exec node server.js

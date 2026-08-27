#!/usr/bin/env bash
# Runs the service under Xvfb so Chromium launches "headed" (HEADLESS=false)
# even on a Linux box with no physical display - needed because the plain
# headless flag is what Shopee Shield fingerprints and blocks.
#
# Requires: sudo apt-get install -y xvfb  (Debian/Ubuntu)
set -euo pipefail
cd "$(dirname "$0")/.."
export HEADLESS=false
exec xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" node server.js

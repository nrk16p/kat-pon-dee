#!/usr/bin/env bash
# Expose the local server to the phone over HTTPS.
#
# HTTPS is not optional here. The app is served from Vercel over TLS, so a
# request to http://192.168.x.x is mixed content and the browser drops it before
# it leaves the page — pointing the app at the LAN address simply does not work,
# however fast that route would be.
#
#   ./tunnel.sh                  quick tunnel, throwaway URL, no account
#   ./tunnel.sh kat-pon-dee.example.com    named tunnel, stable URL
#
# Prefer the named tunnel. A quick tunnel mints a new hostname on every restart,
# which means re-entering the endpoint on every phone each morning.
#
# One-time setup for a named tunnel (needs a domain on Cloudflare):
#   cloudflared tunnel login
#   cloudflared tunnel create kat-pon-dee
#   cloudflared tunnel route dns kat-pon-dee kat-pon-dee.example.com
set -euo pipefail

PORT="${PORT:-8000}"
HOSTNAME_ARG="${1:-}"

command -v cloudflared >/dev/null || {
  echo "cloudflared not installed:  brew install cloudflared" >&2
  exit 1
}

if [[ -z "$HOSTNAME_ARG" ]]; then
  echo "quick tunnel — the URL changes every restart."
  echo "for a stable one see the header of this script."
  echo
  exec cloudflared tunnel --url "http://localhost:$PORT"
fi

exec cloudflared tunnel run --url "http://localhost:$PORT" "$HOSTNAME_ARG"

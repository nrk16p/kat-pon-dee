#!/usr/bin/env bash
# Expose the local server to the phone over HTTPS.
#
# HTTPS is not optional here. The app is served from Vercel over TLS, so a
# request to http://192.168.x.x is mixed content and the browser drops it before
# it leaves the page — pointing the app at the LAN address simply does not work,
# however fast that route would be.
#
#   ./tunnel.sh                    ngrok on NGROK_DOMAIN if set, else quick tunnel
#   ./tunnel.sh kpd.example.com    cloudflare named tunnel
#
# A stable hostname is worth more than it sounds. A quick tunnel mints a new one
# on every restart, so every phone in the orchard has to be re-pointed each
# morning — and the restart usually happens when someone is already standing
# over a basket.
#
# ngrok is the cheap way to a stable name: a free account includes one reserved
# domain, no domain purchase, no DNS. Its free tier allows a single agent at a
# time, so this and any other project's tunnel take turns.
#
#   ngrok config add-authtoken <token>       # https://dashboard.ngrok.com
#   NGROK_DOMAIN=<reserved-domain> ./tunnel.sh
#
# Cloudflare is the better long-term answer if you own a domain — no session
# limit, no shared account to contend with:
#   cloudflared tunnel login
#   cloudflared tunnel create kat-pon-dee
#   cloudflared tunnel route dns kat-pon-dee kpd.example.com
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
HOSTNAME_ARG="${1:-}"

# .env is optional and only read for NGROK_DOMAIN, so the reserved name lives
# next to the code rather than in someone's shell history.
if [[ -z "${NGROK_DOMAIN:-}" && -f .env ]]; then
  NGROK_DOMAIN="$(grep -E '^NGROK_DOMAIN=' .env | tail -1 | cut -d= -f2- || true)"
fi

if [[ -z "$HOSTNAME_ARG" && -n "${NGROK_DOMAIN:-}" ]]; then
  command -v ngrok >/dev/null || {
    echo "ngrok not installed:  brew install ngrok/ngrok/ngrok" >&2
    exit 1
  }
  echo "ngrok — stable URL:  https://$NGROK_DOMAIN"
  echo
  # --url, not the older --domain, which ngrok now warns is deprecated.
  exec ngrok http "$PORT" --url="https://$NGROK_DOMAIN" --log=stdout
fi

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

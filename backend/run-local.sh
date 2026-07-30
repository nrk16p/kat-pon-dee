#!/usr/bin/env bash
# Run the measurement server on this Mac, for the field PoC.
#
# Why here and not Render: the hosted instance reports "persisting": false — the
# disk in render.yaml was never applied to the live service — so every capture,
# every grower record and every count has been going straight to /dev/null. A
# laptop with a real filesystem fixes that today, and it happens to be ~10x
# faster at the CV than the shared instance.
#
#   ./run-local.sh              serve on :8000
#   PORT=9000 ./run-local.sh
#
# Pair with ./tunnel.sh to reach it from a phone.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
export DATA_DIR="${DATA_DIR:-$PWD/data}"
export CAPTURE_DIR="${CAPTURE_DIR:-$DATA_DIR/captures}"
export FAILED_DIR="${FAILED_DIR:-$DATA_DIR/failed}"
export GROWERS_FILE="${GROWERS_FILE:-$DATA_DIR/growers.jsonl}"
export SESSION_DIR="${SESSION_DIR:-$DATA_DIR/sessions}"

# A laptop has cores to spare, unlike the 0.5 vCPU the hosted instance ran on.
export MAX_CONCURRENT_JOBS="${MAX_CONCURRENT_JOBS:-2}"

mkdir -p "$CAPTURE_DIR" "$FAILED_DIR" "$SESSION_DIR"

TOKEN_FILE="$DATA_DIR/.api-token"
if [[ -z "${API_TOKEN:-}" ]]; then
  # Persist rather than regenerate: a new token every restart would log every
  # phone out mid-basket.
  if [[ ! -f "$TOKEN_FILE" ]]; then
    umask 077
    head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$TOKEN_FILE"
    echo "generated a new API token in $TOKEN_FILE"
  fi
  API_TOKEN="$(cat "$TOKEN_FILE")"
fi
export API_TOKEN

PY=.venv/bin/python
[[ -x "$PY" ]] || PY=python3

echo "data      $DATA_DIR"
echo "token     $API_TOKEN"
echo "health    http://localhost:$PORT/api/health"
echo

# caffeinate: closing the lid or letting the display sleep kills the server
# mid-session, and the farmer sees a spinner rather than an error.
exec caffeinate -s "$PY" -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --workers 1 \
  --timeout-keep-alive 65

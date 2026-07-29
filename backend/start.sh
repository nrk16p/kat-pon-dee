#!/usr/bin/env bash
# Start script rather than an inline command.
#
# Render's inline startCommand goes through a shell, but an unexpanded or empty
# $PORT makes uvicorn fail argument parsing and exit with code 2 — which the
# dashboard reports only as "Exited with status 2 while running your code",
# with nothing pointing at the port. A script with a default removes that
# failure mode entirely and logs what it resolved.
set -euo pipefail

PORT="${PORT:-10000}"
echo "starting uvicorn on 0.0.0.0:${PORT}"

exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers 1 \
  --timeout-keep-alive 65

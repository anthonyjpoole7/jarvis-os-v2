#!/bin/bash
# Open Jarvis OS v2 dashboard on a port that does NOT collide with live Jarvis services.
# Live services: n8n :5678, Kokoro :8765, voice-relay :8766
# This rebuild static server: :8767
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DASH="$ROOT/dashboard"
PORT=8767

if [[ ! -f "$DASH/index.html" ]]; then
  echo "Missing $DASH/index.html" >&2
  exit 1
fi

# If something is already serving 8767, just open the browser.
if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "Already serving on http://localhost:${PORT} — opening…"
else
  echo "Starting Jarvis OS v2 static server on http://localhost:${PORT}"
  echo "(Original live dashboard is still Option+Cmd+D → ~/jarvis — untouched.)"
  cd "$DASH"
  python3 -m http.server "$PORT" >/tmp/jarvis-os-v2-http.log 2>&1 &
  echo $! > /tmp/jarvis-os-v2-http.pid
  sleep 0.4
fi

URL="http://localhost:${PORT}/"
if command -v open >/dev/null 2>&1; then
  open "$URL"
else
  echo "Open: $URL"
fi

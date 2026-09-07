#!/usr/bin/env bash
# Reliable local UI preview — avoids .next corruption from mixing `npm run build` + `npm run dev`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
PORT_UI="${PORT_UI:-3100}"
PORT_API="${PORT_API:-8101}"

kill_port() {
  local p="$1"
  if lsof -ti :"$p" >/dev/null 2>&1; then
    lsof -ti :"$p" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

case "${1:-start}" in
  start)
    kill_port "$PORT_API"
    kill_port "$PORT_UI"
    if [[ "${CLEAN:-}" == "1" ]] || [[ "${2:-}" == "--clean" ]]; then
      echo "Clearing frontend/.next ..."
      rm -rf "$FRONTEND/.next"
    fi
    echo "Starting mock API on :$PORT_API ..."
    PORT="$PORT_API" node "$FRONTEND/mock-api.local.mjs" &
    API_PID=$!
    echo "Starting Next.js dev on :$PORT_UI ..."
    (
      cd "$FRONTEND"
      API_URL="http://localhost:$PORT_API" NEXT_PUBLIC_API_URL="http://localhost:$PORT_API" \
        npm run dev -- -p "$PORT_UI"
    ) &
    UI_PID=$!
    echo ""
    echo "Preview ready:"
    echo "  UI:  http://localhost:$PORT_UI/dashboard"
    echo "  API: http://localhost:$PORT_API/health"
    echo ""
    echo "PIDs: mock=$API_PID next=$UI_PID"
    echo "Tip: use './scripts/dev-preview.sh stop' before 'npm run build'"
    wait
    ;;
  stop)
    kill_port "$PORT_API"
    kill_port "$PORT_UI"
    echo "Stopped preview servers on :$PORT_API and :$PORT_UI"
    ;;
  *)
    echo "Usage: $0 [start [--clean]|stop]"
    exit 1
    ;;
esac

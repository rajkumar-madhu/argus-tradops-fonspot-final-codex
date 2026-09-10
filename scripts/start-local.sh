#!/usr/bin/env bash
# Start real backend (:8001) + Next.js frontend (:3100) with journal snapshot data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PORT_API="${PORT_API:-8001}"
PORT_UI="${PORT_UI:-3100}"

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
    echo "Starting backend on :$PORT_API ..."
    (
      cd "$BACKEND"
      AUTH_DISABLED=true "$BACKEND/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$PORT_API"
    ) &
    API_PID=$!
    sleep 2
    echo "Starting frontend on :$PORT_UI ..."
    (
      cd "$FRONTEND"
      API_URL="http://localhost:$PORT_API" NEXT_PUBLIC_API_URL="http://localhost:$PORT_API" \
        npm run dev -- -p "$PORT_UI"
    ) &
    UI_PID=$!
    echo ""
    echo "Ready:"
    echo "  UI:  http://localhost:$PORT_UI/dashboard"
    echo "  API: http://localhost:$PORT_API/health"
    echo ""
    echo "PIDs: api=$API_PID next=$UI_PID"
    echo "Stop: $0 stop"
    wait
    ;;
  stop)
    kill_port "$PORT_API"
    kill_port "$PORT_UI"
    echo "Stopped :$PORT_API and :$PORT_UI"
    ;;
  *)
    echo "Usage: $0 [start|stop]"
    exit 1
    ;;
esac

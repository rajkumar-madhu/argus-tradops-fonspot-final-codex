#!/usr/bin/env bash
# Start a real, local read-only snapshot preview. Never kill unrelated listeners.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT_API="${PORT_API:-8102}"
PORT_UI="${PORT_UI:-3102}"
RUN_DIR="${RUN_DIR:-$ROOT/.local/file-preview}"
BACKEND_PYTHON="${BACKEND_PYTHON:-$ROOT/backend/.venv/bin/python}"
mkdir -p "$RUN_DIR"
for port in "$PORT_API" "$PORT_UI"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is occupied. Set PORT_API/PORT_UI to unused ports." >&2; exit 1
  fi
done
# Isolate .next from other dev/build sessions. node_modules is read-only shared.
mkdir -p "$RUN_DIR/frontend"
rsync -a --exclude=node_modules --exclude=.next --exclude=.env.local "$ROOT/frontend/" "$RUN_DIR/frontend/"
ln -sfn "$ROOT/frontend/node_modules" "$RUN_DIR/frontend/node_modules"
API_PID=''; UI_PID=''
cleanup() {
  [[ -z "$UI_PID" ]] || kill "$UI_PID" 2>/dev/null || true
  [[ -z "$API_PID" ]] || kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
(
 cd "$ROOT/backend"
 export TRADEOPS_ENV=development AUTH_DISABLED=true TRADEOPS_DEMO_MODE=false
 export TRADEOPS_JOURNAL_PRIMARY=true TRADEOPS_JOURNAL_PATH="$ROOT/mirae-finspot-management-console-elk/Journal.log"
 export TRADEOPS_CSV_DIR="$ROOT" TRADEOPS_CSV_CACHE_PATH="$RUN_DIR/analytics.sqlite"
 export CORS_ORIGINS="http://127.0.0.1:$PORT_UI,http://localhost:$PORT_UI"
 export ELASTICSEARCH_URL=http://127.0.0.1:19299 ELASTICSEARCH_API_KEY='' ELASTICSEARCH_USERNAME='' ELASTICSEARCH_PASSWORD=''
 export DATABASE_URL=postgresql+psycopg://tradeops:local-placeholder@127.0.0.1:15432/tradeops
 export REDIS_URL=redis://127.0.0.1:16379/0 KEYCLOAK_URL=http://127.0.0.1:18080
 exec "$BACKEND_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT_API" --no-access-log
) >"$RUN_DIR/api.log" 2>&1 &
API_PID=$!
ready=0
for ((attempt=0; attempt<${STARTUP_TIMEOUT_SECONDS:-360}; attempt++)); do
 if curl -fsS "http://127.0.0.1:$PORT_API/health/ready" >/dev/null 2>&1; then ready=1;break;fi
 kill -0 "$API_PID" 2>/dev/null || { echo "API failed; inspect $RUN_DIR/api.log";exit 1; }
 sleep 1
done
[[ "$ready" == 1 ]] || { echo "API startup timed out";exit 1; }
(
 cd "$RUN_DIR/frontend"
 export API_URL="http://127.0.0.1:$PORT_API" INTERNAL_API_URL="http://127.0.0.1:$PORT_API"
 exec "$ROOT/frontend/node_modules/.bin/next" dev --hostname 127.0.0.1 -p "$PORT_UI"
) >"$RUN_DIR/ui.log" 2>&1 &
UI_PID=$!
printf 'File snapshot UI: http://127.0.0.1:%s/dashboard\nAPI: http://127.0.0.1:%s/health/ready\n' "$PORT_UI" "$PORT_API"
wait

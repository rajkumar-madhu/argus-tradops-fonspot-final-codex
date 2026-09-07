#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Starting Docker services..."
docker compose up -d postgres redis migrate backend collector correlation-worker

echo "Starting frontend on :3000..."
cd frontend
if lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 3000 already in use — skipping frontend start"
else
  API_URL=http://localhost:8001 npm run dev -- -p 3000 &
  echo "Frontend PID: $!"
fi

echo ""
echo "URLs:"
echo "  UI:      http://localhost:3000/rejections"
echo "  API:     http://localhost:8001/health"
echo ""
echo "Verify:"
echo "  curl -s -o /dev/null -w '3000: %{http_code}\n' http://localhost:3000/rejections"
echo "  curl -s -o /dev/null -w '8001: %{http_code}\n' http://localhost:8001/health"

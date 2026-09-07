#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

compose_config="$(docker compose -f "$repo_root/docker-compose.yml" config)"

printf '%s\n' "$compose_config" | grep -q 'INTERNAL_API_URL: http://backend:8000'
grep -q 'process.env.INTERNAL_API_URL' "$repo_root/frontend/lib/api.ts"

echo "runtime API configuration contract is valid"

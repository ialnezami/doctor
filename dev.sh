#!/bin/bash
# MediConnect dev launcher — starts API, web, and mobile concurrently

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
MOBILE_DIR="$ROOT/apps/mobile"

trap 'echo ""; echo "Stopping all services..."; kill 0' SIGINT SIGTERM

echo "=== MediConnect Dev ==="

# Install deps if node_modules is missing
for dir in "$API_DIR" "$WEB_DIR" "$MOBILE_DIR"; do
  if [ ! -d "$dir/node_modules" ]; then
    label=$(basename "$dir")
    echo "Installing deps for $label..."
    (cd "$dir" && npm install)
  fi
done

echo "Starting API, Web, and Mobile..."
echo ""

(cd "$API_DIR" && npm run dev 2>&1 | sed 's/^/[api]    /') &
(cd "$WEB_DIR" && npm run dev 2>&1 | sed 's/^/[web]    /') &
(cd "$MOBILE_DIR" && npx expo start 2>&1 | sed 's/^/[mobile] /') &

wait

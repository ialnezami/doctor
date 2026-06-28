#!/bin/bash
# MediConnect — rebuild Docker images and restart the full stack

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== MediConnect Docker Rebuild ==="
echo ""

# Pull latest code if inside a git repo
if git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "→ Pulling latest commits..."
  git pull --ff-only
  echo ""
fi

# Stop and remove existing containers (keep volumes)
echo "→ Stopping running containers..."
docker compose down --remove-orphans
echo ""

# Rebuild all custom images (no cache to pick up code changes)
echo "→ Building images (no cache)..."
docker compose build --no-cache
echo ""

# Start everything in detached mode
echo "→ Starting stack..."
docker compose up -d
echo ""

# Tail logs for a few seconds so the user can verify startup
echo "→ Container status:"
docker compose ps
echo ""
echo "→ Tailing logs (Ctrl+C to stop following, containers keep running)..."
echo ""
docker compose logs -f --tail=50

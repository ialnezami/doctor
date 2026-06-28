#!/bin/bash
# update.sh — fast incremental Docker update for MediConnect
# Rebuilds only changed services using layer cache (much faster than rebuild.sh)
#
# Usage:
#   ./update.sh          # auto-detect changed services from git
#   ./update.sh api      # rebuild API only
#   ./update.sh web      # rebuild web only
#   ./update.sh all      # rebuild both

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${CYAN}=== MediConnect Fast Update ===${NC}"
echo ""

# Determine which services need rebuilding
if [ -n "$1" ]; then
  case "$1" in
    all)       SERVICES="api web" ;;
    api|web)   SERVICES="$1" ;;
    *)
      echo -e "${RED}Unknown service '$1'. Use: api, web, or all${NC}"
      exit 1
      ;;
  esac
else
  # Auto-detect: changed files in last commit + uncommitted working tree changes
  CHANGED=$(
    git diff --name-only HEAD~1 HEAD 2>/dev/null
    git status --porcelain 2>/dev/null | awk '{print $2}'
  )

  SERVICES=""
  echo "$CHANGED" | grep -q "^apps/api" && SERVICES="api"
  echo "$CHANGED" | grep -q "^apps/web" && SERVICES="${SERVICES:+$SERVICES }web"

  if [ -z "$SERVICES" ]; then
    echo -e "${YELLOW}No changes detected in apps/api or apps/web.${NC}"
    echo "  Run with a service name to force: ./update.sh [api|web|all]"
    echo ""
    docker compose ps
    exit 0
  fi
fi

echo -e "→ Updating:${CYAN} ${SERVICES}${NC}"
echo ""

for svc in $SERVICES; do
  echo -e "${YELLOW}▶ Building ${svc} (with cache)...${NC}"
  docker compose build "$svc"

  echo -e "${YELLOW}▶ Restarting ${svc}...${NC}"
  docker compose up -d --no-deps "$svc"

  echo -e "${GREEN}✓ ${svc} updated${NC}"
  echo ""
done

echo "→ Container status:"
docker compose ps
echo ""
echo -e "${GREEN}=== Done ===${NC}"
echo ""

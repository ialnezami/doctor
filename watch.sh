#!/bin/bash
# watch.sh — auto-rebuild Docker when source files change
# Watches apps/api/src and apps/web/src, triggers ./update.sh on change
#
# Requires fswatch:  brew install fswatch
# Usage: ./watch.sh

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

if ! command -v fswatch &>/dev/null; then
  echo -e "${RED}fswatch not found.${NC} Install with:"
  echo "  brew install fswatch"
  exit 1
fi

echo ""
echo -e "${CYAN}=== MediConnect Watch Mode ===${NC}"
echo "Watching: apps/api/src  apps/web/src"
echo "Press Ctrl+C to stop."
echo ""

LAST_RUN=0
PENDING=""

# fswatch emits one line per changed file; we batch with a 2s debounce
fswatch -r -l 0.5 \
  --exclude "node_modules" \
  --exclude ".git" \
  --exclude "*.map" \
  --exclude "dist" \
  "$ROOT/apps/api/src" \
  "$ROOT/apps/web/src" | while IFS= read -r changed_file; do

  NOW=$(date +%s)

  # Track which service(s) changed
  echo "$changed_file" | grep -q "/apps/api/" && PENDING="${PENDING}api "
  echo "$changed_file" | grep -q "/apps/web/" && PENDING="${PENDING}web "

  # Debounce: only trigger if 2s have passed since last event
  if (( NOW - LAST_RUN >= 2 )) && [ -n "$PENDING" ]; then
    LAST_RUN=$NOW

    # Deduplicate services
    SERVICES=$(echo "$PENDING" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs)
    PENDING=""

    echo ""
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] Change detected → rebuilding: ${SERVICES}${NC}"
    "$ROOT/update.sh" $SERVICES || echo -e "${RED}Update failed — fix errors and save again${NC}"
  fi
done

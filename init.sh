#!/usr/bin/env bash
# AITaskQueue init script
# 每个新 session / 新开发者执行一次，确保环境可用

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
NC="\033[0m"

log()   { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo -e "${BOLD}AITaskQueue — Environment Init${NC}"
echo "=================================="

# 1. Check Node.js
if ! command -v node &> /dev/null; then
  error "Node.js not found. Install Node.js >= 22: https://nodejs.org"
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  warn "Node.js v$(node -v) detected. Recommended: >= 22"
else
  log "Node.js $(node -v)"
fi

# 2. Check pnpm
if ! command -v pnpm &> /dev/null; then
  warn "pnpm not found. Installing..."
  npm install -g pnpm
fi
log "pnpm $(pnpm -v)"

# 3. Install dependencies
if [ ! -d "node_modules" ]; then
  echo ""
  echo "Installing dependencies..."
  pnpm install
  log "Dependencies installed"
else
  log "node_modules exists (run 'pnpm install' to update)"
fi

# 4. Check required files
echo ""
REQUIRED_FILES=("package.json" "vite.config.ts" "tsconfig.json" "src/main.tsx" "src/index.css")
for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    log "$f ✓"
  else
    warn "$f missing!"
  fi
done

# 5. Type check
echo ""
echo "Running type check..."
if pnpm build 2>/dev/null; then
  log "TypeScript compilation OK"
else
  warn "TypeScript errors detected (run 'pnpm build' for details)"
fi

# 6. Summary
echo ""
echo "=================================="
echo -e "${GREEN}${BOLD}Ready!${NC} Run ${BOLD}pnpm dev${NC} to start the dev server."
echo ""
echo "Useful commands:"
echo "  pnpm dev       → Start dev server (http://localhost:5173)"
echo "  pnpm build     → Type-check + production build"
echo "  pnpm lint      → ESLint"
echo "  pnpm test      → Run tests (Vitest)"
echo ""

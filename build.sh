#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root (the directory this script lives in)
cd "$(dirname "$0")"

# Install dependencies on first run (node_modules is git-ignored)
if [ ! -d node_modules ]; then
  echo "node_modules not found — installing dependencies..."
  npm install
fi

# Type-check, then build the static site (HTML + hashed CSS/JS) into ./dist.
# Extra args are passed through to Vite, e.g: ./build.sh --base=/converter/
echo "Building static site into ./dist ..."
npm run build -- "$@"

# Vite copies everything from public/. The local sample image symlink is useful
# for manual browser testing, but it must not ship in production output.
rm -rf dist/sample

echo ""
echo "Done. Static output in ./dist:"
ls -1 dist

#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root (the directory this script lives in)
cd "$(dirname "$0")"

sample_link="public/sample"
sample_link_hidden=".sample.public-link"

restore_sample_link() {
  if [ -L "$sample_link_hidden" ] && [ ! -e "$sample_link" ]; then
    mv "$sample_link_hidden" "$sample_link"
  fi
}

trap restore_sample_link EXIT

# Install dependencies on first run (node_modules is git-ignored)
if [ ! -d node_modules ]; then
  echo "node_modules not found — installing dependencies..."
  npm install
fi

# Vite copies everything from public/. The local sample image symlink is useful
# for manual browser testing, but it must not ship in production output.
if [ -L "$sample_link" ]; then
  mv "$sample_link" "$sample_link_hidden"
fi

# Type-check, then build the static site (HTML + hashed CSS/JS) into ./dist.
# Extra args are passed through to Vite, e.g: ./build.sh --base=/converter/
echo "Building static site into ./dist ..."
npm run build:site -- "$@"

restore_sample_link

echo ""
echo "Done. Static output in ./dist:"
ls -1 dist

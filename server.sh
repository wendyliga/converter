#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root (the directory this script lives in)
cd "$(dirname "$0")"

# Install dependencies on first run (node_modules is git-ignored)
if [ ! -d node_modules ]; then
  echo "node_modules not found — installing dependencies..."
  npm install
fi

# Start the Vite dev server and host it locally.
# Extra args are passed through, e.g: ./server.sh --host --port 3000
echo "Starting Vite dev server on http://localhost:5173"
exec npm run dev -- "$@"

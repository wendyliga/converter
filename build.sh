#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root (the directory this script lives in)
cd "$(dirname "$0")"

sample_link="public/sample"
sample_link_hidden=".sample.public-link"

github_repo_url() {
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then
    printf 'https://github.com/%s\n' "$GITHUB_REPOSITORY"
    return
  fi

  local remote_url=""
  remote_url="$(git -C "$PWD" remote get-url origin 2>/dev/null || true)"

  if [[ "$remote_url" =~ ^git@github\.com:(.+)\.git$ ]]; then
    printf 'https://github.com/%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$remote_url" =~ ^https://github\.com/(.+)\.git$ ]]; then
    printf 'https://github.com/%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$remote_url" =~ ^https://github\.com/.+ ]]; then
    printf '%s\n' "$remote_url"
  else
    printf 'https://github.com/wendyliga/converter\n'
  fi
}

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

build_commit="$(git -C "$PWD" rev-parse HEAD 2>/dev/null || true)"
build_commit_short="$(git -C "$PWD" rev-parse --short=12 HEAD 2>/dev/null || true)"
build_repo_url="$(github_repo_url)"

# Type-check, then build the static site (HTML + hashed CSS/JS) into ./dist.
# Extra args are passed through to Vite, e.g: ./build.sh --base=/converter/
echo "Building static site into ./dist ..."
VITE_GITHUB_REPO_URL="$build_repo_url" \
VITE_BUILD_COMMIT="$build_commit" \
VITE_BUILD_COMMIT_SHORT="$build_commit_short" \
  npm run build:site -- "$@"

restore_sample_link

echo ""
echo "Done. Static output in ./dist:"
ls -1 dist

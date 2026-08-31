#!/usr/bin/env bash
set -euo pipefail

# Rasterises public/og-image.svg into public/og-image.png (1200x630, the size
# declared in index.html). The SVG embeds its own fonts, so the only external
# requirement is a Chromium-family browser to lay out the text.
#
# Run this after editing public/og-image.svg — nothing else regenerates it.

cd "$(dirname "$0")"

svg="public/og-image.svg"
png="public/og-image.png"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

chrome=""
for candidate in \
  "${CHROME:-}" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    chrome="$candidate"
    break
  fi
done

if [ -z "$chrome" ]; then
  echo "No Chromium-family browser found. Set CHROME=/path/to/chrome and retry." >&2
  exit 1
fi

{
  printf '<!doctype html><meta charset="utf-8">'
  printf '<style>html,body{margin:0;padding:0;background:#fbfbfa}svg{display:block}</style>\n'
  cat "$svg"
} > "$work/render.html"

# Chrome's own diagnostics are kept rather than discarded: under `set -e` a
# non-zero exit would otherwise abort the script with nothing to go on.
if ! "$chrome" \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --screenshot="$work/og.png" "file://$work/render.html" >"$work/chrome.log" 2>&1; then
  echo "Chrome failed to render the card:" >&2
  tail -n 20 "$work/chrome.log" >&2
  exit 1
fi

if [ ! -s "$work/og.png" ]; then
  echo "Chrome exited cleanly but produced no screenshot." >&2
  tail -n 20 "$work/chrome.log" >&2
  exit 1
fi

# The card uses a handful of flat colours, so a 256-colour palette is visually
# identical (RMSE < 1%) at roughly a third of the bytes.
if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick not found; writing the unquantised screenshot." >&2
  cp "$work/og.png" "$png"
elif ! magick "$work/og.png" -strip PNG8:"$png"; then
  echo "ImageMagick failed; writing the unquantised screenshot." >&2
  cp "$work/og.png" "$png"
fi

echo "Wrote $png ($(wc -c < "$png" | tr -d ' ') bytes)"

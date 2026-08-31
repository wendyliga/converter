# Converter

A privacy-focused image converter that runs entirely in your browser. Convert PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, and ICO to PNG, JPG, or WebP — no upload, no account, no server processing.

## Features

- **100% local** — images are decoded, resized, and re-encoded with the browser's own canvas APIs; files never leave your device
- **Batch conversion** — queue up to 50 files, convert sequentially, download individually or as a ZIP
- **Quality control** — JPEG/WebP quality slider (PNG is lossless)
- **Resize** — set width/height or max width/height, with aspect-ratio lock and no-upscale protection
- **Transparency handling** — JPEG output warns about transparency loss and fills with a selectable background color
- **Metadata control** — EXIF is stripped by default (the canvas re-encode drops it); files carrying camera, date, or GPS data are flagged in the queue, and an opt-in checkbox re-injects the tags into PNG and JPG output with orientation and pixel-dimension tags corrected, the stale embedded thumbnail dropped, and GPS removable separately
- **Fast** — heavy raster work runs in a Web Worker with `OffscreenCanvas`; the HEIC (libheif WASM) and TIFF (UTIF.js) decoders are lazy-loaded chunks that download only when needed

## Development

```bash
npm install
./server.sh        # install deps if needed, then start Vite at http://localhost:5173
npm run dev        # start Vite directly
npm run lint       # run oxlint
npm run typecheck  # run TypeScript checks
npm test           # run Vitest unit tests
```

Every pull request runs lint, typecheck, tests and a production build through `.github/workflows/ci.yml`, which also asserts the HEIC and TIFF decoders are still lazy-loaded chunks rather than folded into the main bundle.

Use the real files in `sample/` for manual conversion testing. They are committed to the repo but are not included in production builds — only the `public/sample` symlink that serves them to the dev server is gitignored.

## Build

```bash
npm run build      # same as ./build.sh
./build.sh         # create the static production site in dist/
```

`build.sh` runs the production Vite build and keeps local testing fixtures out of the output. The generated site is written to `dist/`.

The social preview card is not part of that build. `public/og-image.svg` is the source; `./og-image.sh` rasterises it to `public/og-image.png` at the 1200x630 declared in `index.html`, using a headless Chromium for text layout and ImageMagick to quantise. Run it whenever the SVG changes.

## Deployment

Deploy the contents of `dist/` to any static host.

```bash
npm run build
# upload or serve dist/
```

The build uses a relative Vite base (`./`), so it works from a domain root, a GitHub Pages project path such as `/converter/`, or another static subdirectory.

## License

See [LICENSE](LICENSE).

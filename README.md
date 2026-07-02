# Converter

A privacy-focused image converter that runs entirely in your browser. Convert PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, and ICO to PNG, JPG, or WebP — no upload, no account, no server processing.

## Features

- **100% local** — images are decoded, resized, and re-encoded with the browser's own canvas APIs; files never leave your device
- **Batch conversion** — queue up to 50 files, convert sequentially, download individually or as a ZIP
- **Quality control** — JPEG/WebP quality slider (PNG is lossless)
- **Resize** — set width/height or max width/height, with aspect-ratio lock and no-upscale protection
- **Transparency handling** — JPEG output warns about transparency loss and fills with a selectable background color
- **Fast** — heavy raster work runs in a Web Worker with `OffscreenCanvas`; the HEIC (libheif WASM) and TIFF (UTIF.js) decoders are lazy-loaded chunks that download only when needed

## Development

```bash
npm install
npm run dev        # start the Vite dev server
npm run lint       # oxlint
npm run typecheck  # tsc
npm test           # vitest unit tests
npm run build      # production build into dist/
```

`./server.sh` installs dependencies if needed and starts the dev server.

## Deployment

`npm run build` outputs a static site into `dist/`. The Vite `base` is relative (`./`), so the build works on GitHub Pages (including project-site subpaths) or any static host — just serve the `dist/` folder.

## Architecture

```
src/
  components/   React UI (dropzone, queue, settings)
  core/         framework-independent conversion engine
  workers/      Web Worker for resize + encode
  types/        shared TypeScript types
```

The pipeline follows: detect format (magic bytes → MIME → extension) → decode to `ImageBitmap` → resize → background fill (JPEG) → encode to Blob → object URL → download.

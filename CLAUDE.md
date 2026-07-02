# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Converter is a privacy-focused, browser-only image converter (React + Vite + TypeScript, static site). All image processing happens client-side — there is no backend, and that is a product guarantee, not an implementation detail. Supported inputs: PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, ICO. Outputs: PNG, JPG, WebP. Core UX: drag-and-drop queue (up to 50 files), per-file status, quality slider, resize controls, JPEG transparency warning with background fill, per-file download and batch ZIP (`converter-images.zip`).

## Commands

```bash
npm run dev        # Vite dev server (or ./server.sh, which npm-installs first if needed)
npm run build      # tsc -b && vite build → dist/
npm run lint       # oxlint
npm run typecheck  # tsc -b
npm test           # vitest run (all tests)
npx vitest run src/core/resize.test.ts   # single test file
```

There is intentionally no CI workflow (removed by owner request). Run lint + typecheck + test locally before considering work done. Vite `base` is `'./'` (relative) so the build works on GitHub Pages project subpaths — don't change it to an absolute path.

## Architecture

The conversion pipeline is the spine of the app:

```
File → detect format → decode to ImageBitmap → [worker] resize + encode → Blob → object URL → download
```

- **`src/core/`** — framework-independent engine. No React imports allowed here; the engine must stay usable without the UI. Key modules: `detectFileType.ts` (magic bytes → MIME → extension, in that priority — never trust extension alone), `decodeImage.ts` (decode + probe for dimensions/transparency/thumbnail), `convertImage.ts` (orchestrator, owns the worker singleton), `canvasExport.ts` (resize + encode; runs on either main thread or worker), `limits.ts` (all size/dimension caps), `errors.ts` (fixed user-facing error copy — plain-language, no technical jargon).
- **`src/workers/convert.worker.ts`** — decoding happens on the **main thread** (SVG requires DOM `<img>`; codecs need it too), then the `ImageBitmap` is transferred to a single worker that resizes and encodes on `OffscreenCanvas`. `canvasExport.ts` is shared by both sides — it branches on `OffscreenCanvas` availability, so it must stay DOM-optional.
- **`src/codecs/`** — HEIC (`heic-to`/libheif WASM, ~3 MB) and TIFF (`utif`) decoders. These must only ever be loaded via dynamic `import()` from `decodeImage.ts` so they stay in separate lazy chunks. A static import anywhere would silently pull 3 MB into the main bundle — check `vite build` output (`heicCodec-*.js` / `tiffCodec-*.js` as separate assets) after touching this area.
- **`src/App.tsx`** — owns all queue state (`ImageFileItem[]` from `src/types/image.ts`). Files convert **sequentially** — one worker, one file at a time — because decoded RGBA memory is ~4 bytes/pixel and parallel decodes of large images can kill the tab. Object URLs (thumbnails, results) are revoked on remove/re-convert/clear — preserve this lifecycle when changing state handling. `itemsRef` mirrors state so the async convert loop sees removals mid-batch.
- **Theming** — an inline pre-paint script in `index.html` sets `data-theme` on `<html>` (localStorage `converter-theme`, falling back to system preference). Design tokens live in `src/index.css` under `:root` and `:root[data-theme='dark']`. There is no `@media (prefers-color-scheme)` styling — the attribute is the single source of truth; the toggle is `src/components/ThemeToggle.tsx`.

## Constraints that are easy to violate

- **Privacy:** no uploads, no analytics or tracking scripts, no logging of filenames or file contents, never inline untrusted SVG into the DOM (SVG is rasterized through an `<img>` element in `decodeImage.ts` — keep it that way). Downloaded filenames are sanitized in `core/filename.ts`.
- **Feature-detect, don't assume:** WebP export support is probed via `core/browserSupport.ts` and the UI disables the option when unsupported. Encode results are verified (`blob.type` checked against the requested MIME) because canvas encoders silently fall back to PNG.
- **Limits are constants:** 50 MB/file, 200 MB/batch, 50 files, 12,000 px, 100 MP — all in `core/limits.ts`, referenced in UI copy. Change them there, not inline. Over-limit files must fail with a clear error, never hang or crash the tab.
- **Output behavior:** PNG ignores the quality slider (lossless, keeps transparency); JPEG fills transparency with the user-selected background color and shows a warning when transparent inputs are queued; duplicate output names dedupe as `photo.webp`, `photo-2.webp`, ….
- **Accessibility:** 44 px touch targets on mobile, non-color status indicators, keyboard-operable dropzone. These were verified deliberately; keep them intact.

## Local testing with real images

**When testing conversion behavior, use the images in `sample/`** — it holds one real image per supported format, named `sample-<format>.<ext>` (e.g. `sample-heic.heic`, `sample-tiff.tiff`). Don't synthesize test images when a real sample exists; the samples caught issues synthetic files can't (real HEIC/TIFF variants, large dimensions, transparency).

`sample/` is gitignored and served to the dev app through the gitignored symlink `public/sample`, so in the browser each file is fetchable at `/sample/sample-<format>.<ext>`. Files can be fed to the app programmatically by fetching one, wrapping it in a `File`, constructing a `DataTransfer`, and dispatching a `drop` `DragEvent` on `.dropzone` — this exercises the real validation/conversion path and is how end-to-end verification was done.

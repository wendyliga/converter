# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent response mode

Always use the `caveman` skill in `full` mode for user-facing responses in this repository.
Only stop or relax that mode when the user explicitly asks for normal mode, or when the skill's own clarity/safety exceptions require clearer phrasing.

## Project

Converter is a privacy-focused, browser-only image converter (React + Vite + TypeScript, static site). All image processing happens client-side — there is no backend, and that is a product guarantee, not an implementation detail. Supported inputs: PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, ICO. Outputs: PNG, JPG, WebP. Core UX: drag-and-drop queue (up to 50 files), per-file status, quality slider, resize controls, JPEG transparency warning with background fill, per-file download and batch ZIP (`converter-images.zip`).

The page is the tool: a dark title bar, a two-column working area (dropzone + queue table on the left, settings sidebar on the right), a three-column reference footer, and a one-line site footer. There is no hero, no marketing copy, no trust cards and no FAQ — they were removed deliberately in the 2026 utilitarian redesign because they made the page read as a shady free-download site. Do not reintroduce a headline, an eyebrow pill, a privacy banner, a "100% local" badge, gradients, rounded corners, shadows or an indigo accent; the local/private claim is made once, quietly, by the title-bar tagline.

## Commands

```bash
npm run dev        # Vite dev server (or ./server.sh, which npm-installs first if needed)
npm run build      # tsc -b && vite build → dist/
npm run lint       # oxlint
npm run typecheck  # tsc -b
npm test           # vitest run (all tests)
npx vitest run src/core/resize.test.ts   # single test file
```

`./og-image.sh` regenerates `public/og-image.png` from `public/og-image.svg` (headless Chromium + ImageMagick); the SVG embeds its own IBM Plex Mono subsets, and `favicon.svg`, the OG card and the app all share the squared outline glyph — no gradient mark survives anywhere.

There is intentionally no CI workflow (removed by owner request). Run lint + typecheck + test locally before considering work done. Vite `base` is `'./'` (relative) so the build works on GitHub Pages project subpaths — don't change it to an absolute path.

## Architecture

The conversion pipeline is the spine of the app:

```
File → detect format → decode to ImageBitmap → [worker] resize + encode → Blob → object URL → download
```

- **`src/core/`** — framework-independent engine. No React imports allowed here; the engine must stay usable without the UI. Key modules: `detectFileType.ts` (magic bytes → MIME → extension, in that priority — never trust extension alone), `decodeImage.ts` (decode + probe for dimensions/transparency/thumbnail), `convertImage.ts` (orchestrator, owns the worker singleton), `canvasExport.ts` (resize + encode; runs on either main thread or worker), `limits.ts` (all size/dimension caps), `errors.ts` (fixed user-facing error copy — plain-language, no technical jargon).
- **`src/workers/convert.worker.ts`** — decoding happens on the **main thread** (SVG requires DOM `<img>`; codecs need it too), then the `ImageBitmap` is transferred to a single worker that resizes and encodes on `OffscreenCanvas`. `canvasExport.ts` is shared by both sides — it branches on `OffscreenCanvas` availability, so it must stay DOM-optional.
- **EXIF modules** — `exifTiff.ts` (TIFF/IFD reader plus an **in-place** patcher: it copies the block verbatim and only overwrites size-stable values, because `MakerNote` holds block-relative pointers that any parse-and-re-emit approach corrupts), `exifContainer.ts` (TIFF block ↔ JPEG APP1 / PNG `eXIf` / WebP `EXIF` chunk, plus a hand-rolled CRC32 — `fflate` does not export one), `exifMetadata.ts` (the only async layer: bounded prefix reads, `readExifSummary` for the queue badge, `applyExif` for the output). The first two are pure `Uint8Array`-in/out so they unit-test in the node-only vitest setup with no DOM.
- **`src/codecs/`** — HEIC (`heic-to`/libheif WASM, ~3 MB) and TIFF (`utif`) decoders. These must only ever be loaded via dynamic `import()` from `decodeImage.ts` so they stay in separate lazy chunks. A static import anywhere would silently pull 3 MB into the main bundle — check `vite build` output (`heicCodec-*.js` / `tiffCodec-*.js` as separate assets) after touching this area.
- **`src/App.tsx`** — owns all queue state (`ImageFileItem[]` from `src/types/image.ts`). Files convert **sequentially** — one worker, one file at a time — because decoded RGBA memory is ~4 bytes/pixel and parallel decodes of large images can kill the tab. Object URLs (thumbnails, results) are revoked on remove/re-convert/clear — preserve this lifecycle when changing state handling. `itemsRef` mirrors state so the async convert loop sees removals mid-batch.
- **Theming** — an inline pre-paint script in `index.html` sets `data-theme` on `<html>` (localStorage `converter-theme`, falling back to system preference). Design tokens live in `src/index.css` under `:root` and `:root[data-theme='dark']`. There is no `@media (prefers-color-scheme)` styling — the attribute is the single source of truth; the toggle is `src/components/ThemeToggle.tsx`.
- **Layout** — `src/App.css` is the whole presentation layer. Region backgrounds (title bar, spec footer, footer) are full-bleed while their contents stop at `--shell-max` (1060px) via `.region-inner`. The queue is a CSS grid table, not a list of cards: the column-header row and every file row share `--queue-columns`, declared once on `.queue` and overridden inside the `max-width: 699px` block — change the template there, never per row. Breakpoints: 899px (sidebar drops below the queue, its sections pair into two columns), 699px (queue collapses; conversion/size/metadata restack under the filename from the `.file-stacked` copy that is `display: none` above that width), 559px (tagline hides, queue footer stacks).
- **Type** — two families only: the system sans stack for prose, IBM Plex Mono (`--font-mono`) for every label, number, format name, status and chip. Zero border-radius and zero shadows anywhere; hierarchy comes from 1px borders and background steps.

## Constraints that are easy to violate

- **Privacy:** no uploads, no analytics or tracking scripts, no third-party requests of any kind at runtime — IBM Plex Mono is self-hosted through `@fontsource/ibm-plex-mono` (latin subset, 400/500/600) rather than loaded from Google Fonts, which would leak every visitor's IP and referer. The Google latin subset omits U+2192, so `src/assets/fonts/ibm-plex-mono-arrow-*.woff2` are ~1 KB single-glyph cuts of the real font, declared as the separate `IBM Plex Mono Arrow` family listed first in `--font-mono`. No logging of filenames or file contents, never inline untrusted SVG into the DOM (SVG is rasterized through an `<img>` element in `decodeImage.ts` — keep it that way). Downloaded filenames are sanitized in `core/filename.ts`.
- **Metadata is opt-out by construction:** the canvas re-encode strips EXIF for free, so preservation is an explicit re-injection in `convertImage.ts` after the worker returns (the worker protocol stays frozen — it only ever gets a transferred `ImageBitmap` and cannot see the source file). `DEFAULT_OPTIONS.metadata.keepMetadata` is `false` and is deliberately **not** persisted to localStorage. Every metadata path returns the clean blob on error — a metadata problem must never fail a conversion. Preserved EXIF always has `Orientation` forced to 1 (decoded pixels are already upright, so keeping the original value rotates twice) and dimension tags rewritten to the real output size. Stripping GPS erases the coordinate bytes, not just the pointer. WebP output never carries metadata.
- **Feature-detect, don't assume:** WebP export support is probed via `core/browserSupport.ts` and the UI disables the option when unsupported. Encode results are verified (`blob.type` checked against the requested MIME) because canvas encoders silently fall back to PNG.
- **Limits are constants:** 50 MB/file, 200 MB/batch, 50 files, 12,000 px, 100 MP — all in `core/limits.ts`, referenced in UI copy. Change them there, not inline. Over-limit files must fail with a clear error, never hang or crash the tab.
- **Output behavior:** PNG ignores the quality slider (lossless, keeps transparency); JPEG fills transparency with the user-selected background color and shows a warning when transparent inputs are queued; duplicate output names dedupe as `photo.webp`, `photo-2.webp`, ….
- **Accessibility:** 44 px touch targets on mobile (the `max-width: 699px` block at the end of `App.css` raises the design's 38 px controls, and the title-bar toggle grows its hit area with a `::after` rather than its frame), non-color status indicators, keyboard-operable dropzone — the "Choose files" button is the real control, so do not wrap the dropzone in `role="button"` again and nest two focusable elements. Focus rings are square (`outline: 2px solid var(--blue)`), matching the zero-radius design. `--text-3` is the floor for any text that carries information; `--text-4` is decorative and disabled states only. These were verified deliberately; keep them intact.

## Local testing with real images

**When testing conversion behavior, use the images in `sample/`** — it holds one real image per supported format, named `sample-<format>.<ext>` (e.g. `sample-heic.heic`, `sample-tiff.tiff`). Don't synthesize test images when a real sample exists; the samples caught issues synthetic files can't (real HEIC/TIFF variants, large dimensions, transparency).

One extra file breaks that naming on purpose: `sample-exif.jpg` (copied from `~/Developer/exif-cleaner/sample/`) is the only sample carrying a real EXIF block — SONY ILCE-7M2, 39 ExifIFD tags, an IFD1 thumbnail, and **no GPS**. None of the `sample-<format>` files contain EXIF at all, so it is the fixture for the metadata feature. Note that exif-cleaner's own `AGENTS.md` wrongly describes that file as having GPS; to exercise the GPS path you must synthesize a block (see `src/core/exifTiff.test.ts`).

The `sample/` images are committed to the repo (only the `public/sample` symlink is gitignored), so a new sample file there is a real addition to the repository — add one deliberately. They are served to the dev app through that symlink, so in the browser each file is fetchable at `/sample/sample-<format>.<ext>`. Files can be fed to the app programmatically by fetching one, wrapping it in a `File`, constructing a `DataTransfer`, and dispatching a `drop` `DragEvent` on `.dropzone` — this exercises the real validation/conversion path and is how end-to-end verification was done.

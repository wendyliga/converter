// The only async, File/Blob-aware layer of the EXIF feature. Everything below
// it is pure byte manipulation; everything here is bounded reads and a single
// guarantee: a metadata problem never fails a conversion.

import type { ImageInputType, OutputFormat } from '../types/image'
import {
  embedExifIntoJpeg,
  embedExifIntoPng,
  extractExifFromJpeg,
  extractExifFromPng,
} from './exifContainer'
import { isTiffBlock, patchTiffBlock, summarizeTiffBlock, type ExifSummary } from './exifTiff'
import { EXIF_SCAN_BYTES, MAX_EXIF_BYTES } from './limits'

// Inputs whose containers we can read a TIFF block out of. TIFF files are
// excluded on purpose: the file *is* the block, with IFD0 typically sitting
// past the image data, so it cannot be reused as an APP1 payload without
// rebuilding the offset table. HEIC/AVIF would need an ISO-BMFF walker.
export const METADATA_READ_FORMATS: ReadonlySet<ImageInputType> = new Set([
  'jpeg',
  'png',
  'webp',
])

// Outputs that can carry a metadata block. WebP would need its simple RIFF
// container rewritten into extended VP8X form, where a wrong flag byte yields
// an unopenable file rather than a missing tag.
export const METADATA_WRITE_FORMATS: ReadonlySet<OutputFormat> = new Set(['jpeg', 'png'])

const MAX_RIFF_CHUNKS = 64

function isFourCc(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < 4; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

async function readBytes(file: File, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

// WebP puts its EXIF chunk after the image data, so walk the chunk table with
// 8-byte header reads and fetch only the chunk itself. `exifContainer`'s
// `extractExifFromWebp` is the buffer-based twin of this walk and carries the
// unit tests for it — fix both together.
async function readWebpExif(file: File): Promise<Uint8Array | null> {
  const header = await readBytes(file, 0, 12)
  if (header.length < 12) return null
  if (!isFourCc(header, 0, 'RIFF') || !isFourCc(header, 8, 'WEBP')) return null

  let offset = 12
  for (let i = 0; i < MAX_RIFF_CHUNKS && offset + 8 <= file.size; i += 1) {
    const chunk = await readBytes(file, offset, offset + 8)
    if (chunk.length < 8) return null
    const size =
      (chunk[4] | (chunk[5] << 8) | (chunk[6] << 16) | (chunk[7] << 24)) >>> 0
    const dataOffset = offset + 8
    if (dataOffset + size > file.size) return null
    if (isFourCc(chunk, 0, 'EXIF')) {
      if (size === 0 || size > EXIF_SCAN_BYTES) return null
      const data = await readBytes(file, dataOffset, dataOffset + size)
      // Some encoders wrongly repeat the JPEG-style signature here.
      return isFourCc(data, 0, 'Exif') && data[4] === 0 && data[5] === 0
        ? data.subarray(6)
        : data
    }
    // Chunks are padded to an even length.
    offset = dataOffset + size + (size % 2)
  }
  return null
}

/** Reads the raw TIFF block out of the source file. Never rejects. */
export async function readSourceExif(
  file: File,
  inputFormat: ImageInputType,
): Promise<Uint8Array | null> {
  if (!METADATA_READ_FORMATS.has(inputFormat)) return null
  try {
    if (inputFormat === 'webp') return await readWebpExif(file)
    const head = await readBytes(file, 0, Math.min(file.size, EXIF_SCAN_BYTES))
    const block = inputFormat === 'jpeg' ? extractExifFromJpeg(head) : extractExifFromPng(head)
    return block && isTiffBlock(block) ? block : null
  } catch {
    return null
  }
}

/**
 * Display summary for the queue badge. Resolves undefined rather than
 * rejecting, so a metadata problem can never mark a file as failed.
 */
export async function readExifSummary(
  file: File,
  inputFormat: ImageInputType,
): Promise<ExifSummary | undefined> {
  try {
    const block = await readSourceExif(file, inputFormat)
    if (!block) return undefined
    const summary = summarizeTiffBlock(block)
    return summary && summary.fields.length > 0 ? summary : undefined
  } catch {
    return undefined
  }
}

/**
 * Re-injects the source metadata into a freshly encoded blob, corrected to
 * describe the image we actually produced. Returns `blob` unchanged on any
 * failure — this is the "never break a conversion" guarantee.
 */
export async function applyExif(
  blob: Blob,
  outputFormat: OutputFormat,
  tiff: Uint8Array,
  width: number,
  height: number,
  stripGps: boolean,
): Promise<Blob> {
  try {
    if (!METADATA_WRITE_FORMATS.has(outputFormat)) return blob
    if (!isTiffBlock(tiff)) return blob

    const patched = patchTiffBlock(tiff, {
      outputWidth: width,
      outputHeight: height,
      stripGps,
    })
    if (!patched || patched.length === 0) return blob
    if (outputFormat === 'jpeg' && patched.length > MAX_EXIF_BYTES) return blob

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const merged =
      outputFormat === 'jpeg'
        ? embedExifIntoJpeg(bytes, patched)
        : embedExifIntoPng(bytes, patched)
    if (merged === bytes) return blob
    return new Blob([merged], { type: blob.type })
  } catch {
    return blob
  }
}

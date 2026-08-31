// Moves a raw TIFF/EXIF block in and out of the container formats we support.
// Every function is total: on anything unexpected the extractors return null and
// the embedders return their input untouched, so a metadata problem can never
// break a conversion.

import { MAX_EXIF_BYTES } from './limits'

const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MAX_RIFF_CHUNKS = 64

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  crcTable = table
  return table
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function matchesAt(bytes: Uint8Array, offset: number, pattern: number[]): boolean {
  if (offset + pattern.length > bytes.length) return false
  for (let i = 0; i < pattern.length; i += 1) {
    if (bytes[offset + i] !== pattern[i]) return false
  }
  return true
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

function u16beBytes(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff]
}

function u32beBytes(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function fourCc(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0))
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

// Markers that carry no length field and must not be treated as segments.
function isStandaloneMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)
}

/**
 * Walks JPEG segments, calling `visit` for each one. Stops at SOS, EOI, or any
 * malformed byte — EXIF always precedes the compressed scan data.
 */
function walkJpegSegments(
  jpeg: Uint8Array,
  visit: (marker: number, segmentOffset: number, payloadOffset: number, payloadLength: number) => boolean | void,
): void {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return
  let offset = 2
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) return
    let marker = jpeg[offset + 1]
    // Padding fill bytes are legal between segments.
    let markerOffset = offset + 1
    while (marker === 0xff && markerOffset + 1 < jpeg.length) {
      markerOffset += 1
      marker = jpeg[markerOffset]
    }
    if (marker === 0xda || marker === 0xd9) return
    if (isStandaloneMarker(marker)) {
      offset = markerOffset + 1
      continue
    }
    const lengthOffset = markerOffset + 1
    if (lengthOffset + 2 > jpeg.length) return
    const length = readU16BE(jpeg, lengthOffset)
    if (length < 2 || lengthOffset + length > jpeg.length) return
    if (visit(marker, offset, lengthOffset + 2, length - 2) === true) return
    offset = lengthOffset + length
  }
}

export function extractExifFromJpeg(jpeg: Uint8Array): Uint8Array | null {
  let found: Uint8Array | null = null
  walkJpegSegments(jpeg, (marker, _segmentOffset, payloadOffset, payloadLength) => {
    if (marker !== 0xe1) return
    if (payloadLength <= EXIF_SIGNATURE.length) return
    if (!matchesAt(jpeg, payloadOffset, EXIF_SIGNATURE)) return
    found = jpeg.subarray(payloadOffset + EXIF_SIGNATURE.length, payloadOffset + payloadLength)
    return true
  })
  return found
}

export function embedExifIntoJpeg(
  jpeg: Uint8Array<ArrayBuffer>,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (tiff.length === 0 || tiff.length > MAX_EXIF_BYTES) return jpeg
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg
  if (extractExifFromJpeg(jpeg) !== null) return jpeg

  // JFIF (APP0) is conventionally the first segment; keep it there.
  let insertAt = 2
  walkJpegSegments(jpeg, (marker, segmentOffset, payloadOffset, payloadLength) => {
    if (marker === 0xe0) {
      insertAt = payloadOffset + payloadLength
      return
    }
    if (segmentOffset >= insertAt) return true
  })
  if (insertAt > jpeg.length) return jpeg

  const segment = new Uint8Array([
    0xff,
    0xe1,
    ...u16beBytes(2 + EXIF_SIGNATURE.length + tiff.length),
    ...EXIF_SIGNATURE,
  ])
  return concat([jpeg.subarray(0, insertAt), segment, tiff, jpeg.subarray(insertAt)])
}

/**
 * Walks PNG chunks from the end of the signature. Stops at IEND or a malformed
 * length.
 */
function walkPngChunks(
  png: Uint8Array,
  visit: (type: string, chunkOffset: number, dataOffset: number, dataLength: number) => boolean | void,
): void {
  if (!matchesAt(png, 0, PNG_SIGNATURE)) return
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= png.length) {
    const length = readU32BE(png, offset)
    if (offset + 12 + length > png.length) return
    const type = String.fromCharCode(
      png[offset + 4],
      png[offset + 5],
      png[offset + 6],
      png[offset + 7],
    )
    if (visit(type, offset, offset + 8, length) === true) return
    if (type === 'IEND') return
    offset += 12 + length
  }
}

export function extractExifFromPng(png: Uint8Array): Uint8Array | null {
  let found: Uint8Array | null = null
  walkPngChunks(png, (type, _chunkOffset, dataOffset, dataLength) => {
    if (type === 'IDAT' || type === 'IEND') return true
    if (type !== 'eXIf' || dataLength === 0) return
    found = png.subarray(dataOffset, dataOffset + dataLength)
    return true
  })
  return found
}

export function embedExifIntoPng(
  png: Uint8Array<ArrayBuffer>,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (tiff.length === 0) return png
  if (!matchesAt(png, 0, PNG_SIGNATURE)) return png
  if (extractExifFromPng(png) !== null) return png

  let insertAt = -1
  walkPngChunks(png, (type, chunkOffset) => {
    if (type !== 'IDAT') return
    insertAt = chunkOffset
    return true
  })
  if (insertAt < 0) return png

  const typeAndData = concat([new Uint8Array(fourCc('eXIf')), tiff])
  const chunk = concat([
    new Uint8Array(u32beBytes(tiff.length)),
    typeAndData,
    new Uint8Array(u32beBytes(crc32(typeAndData))),
  ])
  return concat([png.subarray(0, insertAt), chunk, png.subarray(insertAt)])
}

/**
 * Buffer-based counterpart to `exifMetadata.readWebpExif`, which walks the same
 * chunk table with bounded `File.slice` reads instead. WebP stores its EXIF
 * chunk *after* the image data, so the shipping read path uses the streaming
 * version rather than pulling a 50 MB file into memory; this one exists so the
 * chunk walk itself stays covered by the node-only unit tests. Keep the two in
 * step — a fix to the padding rule or the spurious "Exif\0\0" prefix belongs
 * in both.
 */
export function extractExifFromWebp(webp: Uint8Array): Uint8Array | null {
  if (webp.length < 16) return null
  if (!matchesAt(webp, 0, fourCc('RIFF')) || !matchesAt(webp, 8, fourCc('WEBP'))) return null
  let offset = 12
  for (let i = 0; i < MAX_RIFF_CHUNKS && offset + 8 <= webp.length; i += 1) {
    const size = readU32LE(webp, offset + 4)
    const dataOffset = offset + 8
    if (dataOffset + size > webp.length) return null
    if (matchesAt(webp, offset, fourCc('EXIF')) && size > 0) {
      const data = webp.subarray(dataOffset, dataOffset + size)
      // Some encoders wrongly repeat the JPEG-style signature here.
      return matchesAt(data, 0, EXIF_SIGNATURE) ? data.subarray(EXIF_SIGNATURE.length) : data
    }
    // Chunks are padded to an even length.
    offset = dataOffset + size + (size % 2)
  }
  return null
}

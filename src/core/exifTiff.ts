// Hand-rolled TIFF/IFD reader and patcher for EXIF blocks.
//
// The block is never re-serialized. MakerNote (0x927C) stores pointers that are
// relative to the TIFF block, so any tool that parses to a dictionary and emits
// a fresh IFD silently corrupts it. Instead the block is copied verbatim and
// only size-stable values are overwritten in place, which leaves every offset
// in the table valid.

const MAX_IFD_ENTRIES = 512
const ENTRY_SIZE = 12
const HEADER_SIZE = 8

const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
}

// IFD0
const TAG_IMAGE_WIDTH = 0x0100
const TAG_IMAGE_LENGTH = 0x0101
const TAG_MAKE = 0x010f
const TAG_MODEL = 0x0110
const TAG_ORIENTATION = 0x0112
const TAG_SOFTWARE = 0x0131
const TAG_EXIF_IFD = 0x8769
const TAG_GPS_IFD = 0x8825
// ExifIFD
const TAG_EXPOSURE_TIME = 0x829a
const TAG_FNUMBER = 0x829d
const TAG_ISO = 0x8827
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_FOCAL_LENGTH = 0x920a
const TAG_PIXEL_X = 0xa002
const TAG_PIXEL_Y = 0xa003
const TAG_INTEROP_IFD = 0xa005
const TAG_LENS_MODEL = 0xa434
// GPS IFD
const TAG_GPS_LAT_REF = 0x0001
const TAG_GPS_LAT = 0x0002
const TAG_GPS_LON_REF = 0x0003
const TAG_GPS_LON = 0x0004

export type ExifField = { label: string; value: string }

export type ExifSummary = {
  hasGps: boolean
  hasCamera: boolean
  hasDate: boolean
  hasThumbnail: boolean
  camera?: string
  dateTaken?: string
  orientation?: number
  fields: ExifField[]
  byteLength: number
}

export type ExifPatch = {
  outputWidth: number
  outputHeight: number
  stripGps: boolean
}

type IfdEntry = {
  tag: number
  type: number
  count: number
  entryOffset: number
  valueOffset: number
  valueByteLength: number
  isInline: boolean
}

type Ifd = {
  offset: number
  entries: IfdEntry[]
  nextIfdPointerOffset: number
  nextIfdOffset: number
}

function fits(bytes: Uint8Array, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset + length <= bytes.length
}

function readU16(bytes: Uint8Array, offset: number, le: boolean): number {
  return le
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1]
}

function readU32(bytes: Uint8Array, offset: number, le: boolean): number {
  return le
    ? (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>> 0
    : ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>> 0
}

function writeU16(bytes: Uint8Array, offset: number, value: number, le: boolean): void {
  if (le) {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >>> 8) & 0xff
  } else {
    bytes[offset] = (value >>> 8) & 0xff
    bytes[offset + 1] = value & 0xff
  }
}

function writeU32(bytes: Uint8Array, offset: number, value: number, le: boolean): void {
  if (le) {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >>> 8) & 0xff
    bytes[offset + 2] = (value >>> 16) & 0xff
    bytes[offset + 3] = (value >>> 24) & 0xff
  } else {
    bytes[offset] = (value >>> 24) & 0xff
    bytes[offset + 1] = (value >>> 16) & 0xff
    bytes[offset + 2] = (value >>> 8) & 0xff
    bytes[offset + 3] = value & 0xff
  }
}

// Returns the byte order, or null when this is not a TIFF header.
function byteOrder(block: Uint8Array): boolean | null {
  if (block.length < HEADER_SIZE) return null
  if (block[0] === 0x49 && block[1] === 0x49 && block[2] === 0x2a && block[3] === 0x00) return true
  if (block[0] === 0x4d && block[1] === 0x4d && block[2] === 0x00 && block[3] === 0x2a) return false
  return null
}

export function isTiffBlock(block: Uint8Array): boolean {
  const le = byteOrder(block)
  if (le === null) return false
  const ifd0 = readU32(block, 4, le)
  return fits(block, ifd0, 2)
}

// Malformed individual entries are dropped rather than failing the whole IFD —
// a single unreadable tag should not cost the user every other one.
function readIfd(block: Uint8Array, offset: number, le: boolean): Ifd | null {
  if (!fits(block, offset, 2)) return null
  const count = readU16(block, offset, le)
  if (count > MAX_IFD_ENTRIES) return null
  const nextIfdPointerOffset = offset + 2 + count * ENTRY_SIZE
  if (!fits(block, nextIfdPointerOffset, 4)) return null

  const entries: IfdEntry[] = []
  for (let i = 0; i < count; i += 1) {
    const entryOffset = offset + 2 + i * ENTRY_SIZE
    const tag = readU16(block, entryOffset, le)
    const type = readU16(block, entryOffset + 2, le)
    const size = TYPE_SIZE[type]
    if (size === undefined) continue
    const valueCount = readU32(block, entryOffset + 4, le)
    const valueByteLength = size * valueCount
    if (valueByteLength > block.length) continue
    const isInline = valueByteLength <= 4
    const valueOffset = isInline ? entryOffset + 8 : readU32(block, entryOffset + 8, le)
    if (!fits(block, valueOffset, valueByteLength)) continue
    entries.push({
      tag,
      type,
      count: valueCount,
      entryOffset,
      valueOffset,
      valueByteLength,
      isInline,
    })
  }

  return {
    offset,
    entries,
    nextIfdPointerOffset,
    nextIfdOffset: readU32(block, nextIfdPointerOffset, le),
  }
}

function findEntry(ifd: Ifd | null, tag: number): IfdEntry | undefined {
  return ifd?.entries.find((entry) => entry.tag === tag)
}

function readNumeric(
  block: Uint8Array,
  entry: IfdEntry | undefined,
  le: boolean,
): number | undefined {
  if (!entry || entry.count < 1) return undefined
  if (entry.type === 1 || entry.type === 7) return block[entry.valueOffset]
  if (entry.type === 3) return readU16(block, entry.valueOffset, le)
  if (entry.type === 4 || entry.type === 9) return readU32(block, entry.valueOffset, le)
  return undefined
}

function readAscii(block: Uint8Array, entry: IfdEntry | undefined): string | undefined {
  if (!entry || entry.type !== 2 || entry.count < 1) return undefined
  let text = ''
  for (let i = 0; i < entry.count; i += 1) {
    const code = block[entry.valueOffset + i]
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text.trim() || undefined
}

function readRational(
  block: Uint8Array,
  entry: IfdEntry | undefined,
  le: boolean,
  index: number,
): number | undefined {
  if (!entry) return undefined
  if (entry.type !== 5 && entry.type !== 10) return undefined
  if (index >= entry.count) return undefined
  const at = entry.valueOffset + index * 8
  const denominator = readU32(block, at + 4, le)
  if (denominator === 0) return undefined
  return readU32(block, at, le) / denominator
}

function formatCoordinate(
  block: Uint8Array,
  entry: IfdEntry | undefined,
  refEntry: IfdEntry | undefined,
  le: boolean,
): string | undefined {
  if (!entry) return undefined
  const degrees = readRational(block, entry, le, 0)
  if (degrees === undefined) return undefined
  const minutes = readRational(block, entry, le, 1) ?? 0
  const seconds = readRational(block, entry, le, 2) ?? 0
  const decimal = degrees + minutes / 60 + seconds / 3600
  const ref = refEntry ? readAscii(block, refEntry) : undefined
  return `${decimal.toFixed(6)}°${ref ?? ''}`
}

function formatShutter(value: number): string {
  if (value >= 1) return `${value.toFixed(1)} s`
  return `1/${Math.round(1 / value)} s`
}

export function summarizeTiffBlock(block: Uint8Array): ExifSummary | null {
  const le = byteOrder(block)
  if (le === null) return null
  const ifd0 = readIfd(block, readU32(block, 4, le), le)
  if (!ifd0) return null

  const exifPointer = findEntry(ifd0, TAG_EXIF_IFD)
  const exifIfd = exifPointer
    ? readIfd(block, readNumeric(block, exifPointer, le) ?? 0, le)
    : null
  const gpsPointer = findEntry(ifd0, TAG_GPS_IFD)
  const gpsIfd = gpsPointer ? readIfd(block, readNumeric(block, gpsPointer, le) ?? 0, le) : null

  const fields: ExifField[] = []
  const push = (label: string, value: string | undefined) => {
    if (value) fields.push({ label, value })
  }

  const make = readAscii(block, findEntry(ifd0, TAG_MAKE))
  const model = readAscii(block, findEntry(ifd0, TAG_MODEL))
  // Many bodies repeat the manufacturer inside the model string.
  const camera =
    make && model
      ? model.toUpperCase().startsWith(make.toUpperCase())
        ? model
        : `${make} ${model}`
      : (make ?? model)

  const orientation = readNumeric(block, findEntry(ifd0, TAG_ORIENTATION), le)
  const dateTaken = readAscii(block, findEntry(exifIfd, TAG_DATETIME_ORIGINAL))

  push('Camera', camera)
  push('Software', readAscii(block, findEntry(ifd0, TAG_SOFTWARE)))
  push('Lens', readAscii(block, findEntry(exifIfd, TAG_LENS_MODEL)))
  push('Taken', dateTaken)

  const aperture = readRational(block, findEntry(exifIfd, TAG_FNUMBER), le, 0)
  if (aperture !== undefined) push('Aperture', `f/${aperture.toFixed(1)}`)

  const shutter = readRational(block, findEntry(exifIfd, TAG_EXPOSURE_TIME), le, 0)
  if (shutter !== undefined && shutter > 0) push('Shutter', formatShutter(shutter))

  const iso = readNumeric(block, findEntry(exifIfd, TAG_ISO), le)
  if (iso !== undefined) push('ISO', String(iso))

  const focal = readRational(block, findEntry(exifIfd, TAG_FOCAL_LENGTH), le, 0)
  if (focal !== undefined) push('Focal length', `${focal.toFixed(0)} mm`)

  const pixelWidth = readNumeric(block, findEntry(exifIfd, TAG_PIXEL_X), le)
  const pixelHeight = readNumeric(block, findEntry(exifIfd, TAG_PIXEL_Y), le)
  if (pixelWidth !== undefined && pixelHeight !== undefined) {
    push('Dimensions', `${pixelWidth}×${pixelHeight}`)
  }
  if (orientation !== undefined) push('Orientation', String(orientation))

  const latitude = formatCoordinate(
    block,
    findEntry(gpsIfd, TAG_GPS_LAT),
    findEntry(gpsIfd, TAG_GPS_LAT_REF),
    le,
  )
  const longitude = formatCoordinate(
    block,
    findEntry(gpsIfd, TAG_GPS_LON),
    findEntry(gpsIfd, TAG_GPS_LON_REF),
    le,
  )
  push('Latitude', latitude)
  push('Longitude', longitude)

  const hasThumbnail = ifd0.nextIfdOffset !== 0 && fits(block, ifd0.nextIfdOffset, 2)

  return {
    hasGps: (gpsIfd?.entries.length ?? 0) > 0,
    hasCamera: camera !== undefined,
    hasDate: dateTaken !== undefined,
    hasThumbnail,
    camera,
    dateTaken,
    orientation,
    fields,
    byteLength: block.length,
  }
}

// Writes a numeric value into an existing entry without changing its size.
// Returns false when the value does not fit the declared type, which is the
// signal to abandon preservation rather than emit a tag that lies.
function setNumericTag(
  out: Uint8Array,
  entry: IfdEntry,
  le: boolean,
  value: number,
): boolean {
  if (entry.count !== 1) return false
  if (entry.type === 3) {
    if (value > 0xffff) return false
    writeU16(out, entry.valueOffset, value, le)
    return true
  }
  if (entry.type === 4 || entry.type === 9) {
    writeU32(out, entry.valueOffset, value, le)
    return true
  }
  if (entry.type === 1 || entry.type === 7) {
    if (value > 0xff) return false
    out[entry.valueOffset] = value
    return true
  }
  return false
}

function zeroRange(out: Uint8Array, offset: number, length: number): void {
  if (!fits(out, offset, length)) return
  out.fill(0, offset, offset + length)
}

// Erases a sub-IFD's bytes outright. Unlinking the pointer alone would leave the
// values (GPS coordinates, in practice) sitting in the file as readable bytes.
function eraseIfd(out: Uint8Array, ifd: Ifd): void {
  for (const entry of ifd.entries) {
    if (!entry.isInline) zeroRange(out, entry.valueOffset, entry.valueByteLength)
  }
  zeroRange(out, ifd.offset, 2 + ifd.entries.length * ENTRY_SIZE + 4)
}

function ifdEnd(ifd: Ifd): number {
  let end = ifd.nextIfdPointerOffset + 4
  for (const entry of ifd.entries) {
    if (entry.isInline) continue
    end = Math.max(end, entry.valueOffset + entry.valueByteLength)
  }
  return end
}

export function patchTiffBlock(block: Uint8Array, patch: ExifPatch): Uint8Array | null {
  const le = byteOrder(block)
  if (le === null) return null
  const out = block.slice()

  const ifd0 = readIfd(out, readU32(out, 4, le), le)
  if (!ifd0) return null

  // The decoded pixels are already upright (createImageBitmap applies EXIF
  // orientation), so a preserved rotation tag would rotate the image twice.
  const orientation = findEntry(ifd0, TAG_ORIENTATION)
  if (orientation && !setNumericTag(out, orientation, le, 1)) return null

  const width = findEntry(ifd0, TAG_IMAGE_WIDTH)
  if (width && !setNumericTag(out, width, le, patch.outputWidth)) return null
  const height = findEntry(ifd0, TAG_IMAGE_LENGTH)
  if (height && !setNumericTag(out, height, le, patch.outputHeight)) return null

  const exifPointer = findEntry(ifd0, TAG_EXIF_IFD)
  const exifIfd = exifPointer ? readIfd(out, readNumeric(out, exifPointer, le) ?? 0, le) : null
  if (exifIfd) {
    const pixelX = findEntry(exifIfd, TAG_PIXEL_X)
    if (pixelX && !setNumericTag(out, pixelX, le, patch.outputWidth)) return null
    const pixelY = findEntry(exifIfd, TAG_PIXEL_Y)
    if (pixelY && !setNumericTag(out, pixelY, le, patch.outputHeight)) return null
  }

  const gpsPointer = findEntry(ifd0, TAG_GPS_IFD)
  const gpsIfd = gpsPointer ? readIfd(out, readNumeric(out, gpsPointer, le) ?? 0, le) : null
  if (patch.stripGps && gpsPointer) {
    if (gpsIfd) eraseIfd(out, gpsIfd)
    zeroRange(out, gpsPointer.valueOffset, 4)
  }

  // IFD1 holds a thumbnail of the *original* image — wrong size, wrong
  // rotation, and on real files usually most of the block's bytes.
  const hadThumbnail = ifd0.nextIfdOffset !== 0
  writeU32(out, ifd0.nextIfdPointerOffset, 0, le)

  if (!hadThumbnail) return out

  // Reclaim the orphaned thumbnail bytes. Only safe when every sub-IFD that
  // survives is readable, so its extent can be accounted for.
  const interopPointer = findEntry(exifIfd, TAG_INTEROP_IFD)
  const interopIfd = interopPointer
    ? readIfd(out, readNumeric(out, interopPointer, le) ?? 0, le)
    : null
  if (exifPointer && !exifIfd) return out
  if (interopPointer && !interopIfd) return out
  if (gpsPointer && !patch.stripGps && !gpsIfd) return out

  let end = ifdEnd(ifd0)
  if (exifIfd) end = Math.max(end, ifdEnd(exifIfd))
  if (interopIfd) end = Math.max(end, ifdEnd(interopIfd))
  if (gpsIfd && !patch.stripGps) end = Math.max(end, ifdEnd(gpsIfd))

  return end < out.length ? out.subarray(0, end) : out
}

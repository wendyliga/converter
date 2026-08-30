import { describe, expect, it } from 'vitest'
import { isTiffBlock, patchTiffBlock, summarizeTiffBlock } from './exifTiff'

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))
const u16le = (value: number) => [value & 0xff, (value >>> 8) & 0xff]
const u32le = (value: number) => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
]
const entry = (tag: number, type: number, count: number, value: number[]) => [
  ...u16le(tag),
  ...u16le(type),
  ...u32le(count),
  ...value,
  ...new Array(4 - value.length).fill(0),
]
const rational = (numerator: number, denominator: number) => [
  ...u32le(numerator),
  ...u32le(denominator),
]

// Offsets are written out rather than computed so the tests assert the layout
// instead of trusting a generator.
const IFD0 = 0x08
const EXIF_IFD = 0x4a
const GPS_IFD = 0x74
const IFD1 = 0xaa
const MAKE_AT = 0xbc
const MODEL_AT = 0xc1
const DATE_AT = 0xca
const GPS_LAT_AT = 0xde
const GPS_LON_AT = 0xf6
const THUMBNAIL_AT = 0x10e
const BLOCK_LENGTH = 0x11e

const ORIENTATION_VALUE_AT = IFD0 + 2 + 2 * 12 + 8

const GPS_LATITUDE = [...rational(37, 1), ...rational(46, 1), ...rational(2994, 100)]
const GPS_LONGITUDE = [...rational(122, 1), ...rational(25, 1), ...rational(819, 100)]

function buildBlock(options: { orientation?: number[]; gps?: boolean; thumbnail?: boolean } = {}) {
  const orientation = options.orientation ?? [3, 1, ...u16le(6)] // type SHORT, count 1, value 6
  const gps = options.gps ?? true
  const thumbnail = options.thumbnail ?? true

  const bytes: number[] = [
    ...ascii('II'),
    0x2a,
    0x00,
    ...u32le(IFD0),

    // IFD0
    ...u16le(5),
    ...entry(0x010f, 2, 5, u32le(MAKE_AT)),
    ...entry(0x0110, 2, 9, u32le(MODEL_AT)),
    ...entry(0x0112, orientation[0], orientation[1], orientation.slice(2)),
    ...entry(0x8769, 4, 1, u32le(EXIF_IFD)),
    ...entry(0x8825, 4, 1, u32le(gps ? GPS_IFD : 0)),
    ...u32le(thumbnail ? IFD1 : 0),

    // ExifIFD
    ...u16le(3),
    ...entry(0x9003, 2, 20, u32le(DATE_AT)),
    ...entry(0xa002, 4, 1, u32le(4032)),
    ...entry(0xa003, 4, 1, u32le(3024)),
    ...u32le(0),

    // GPS IFD
    ...u16le(4),
    ...entry(0x0001, 2, 2, ascii('N\0')),
    ...entry(0x0002, 5, 3, u32le(GPS_LAT_AT)),
    ...entry(0x0003, 2, 2, ascii('W\0')),
    ...entry(0x0004, 5, 3, u32le(GPS_LON_AT)),
    ...u32le(0),

    // IFD1 (thumbnail)
    ...u16le(1),
    ...entry(0x0201, 4, 1, u32le(THUMBNAIL_AT)),
    ...u32le(0),

    // Value area
    ...ascii('SONY\0'),
    ...ascii('ILCE-7M2\0'),
    ...ascii('2024:03:12 18:04:05\0'),
    ...GPS_LATITUDE,
    ...GPS_LONGITUDE,
    ...new Array(16).fill(0xaa),
  ]
  return new Uint8Array(bytes)
}

function toBigEndian(block: Uint8Array): Uint8Array {
  // Only used to prove the reader is byte-order aware, so it is enough to swap
  // the header and every multi-byte field the fixture actually uses.
  const out = block.slice()
  out[0] = 0x4d
  out[1] = 0x4d
  out[2] = 0x00
  out[3] = 0x2a
  const swap32 = (at: number) => {
    const [a, b, c, d] = [out[at], out[at + 1], out[at + 2], out[at + 3]]
    out[at] = d
    out[at + 1] = c
    out[at + 2] = b
    out[at + 3] = a
  }
  const swap16 = (at: number) => {
    const [a, b] = [out[at], out[at + 1]]
    out[at] = b
    out[at + 1] = a
  }
  swap32(4)
  for (const [ifdAt, count] of [
    [IFD0, 5],
    [EXIF_IFD, 3],
    [GPS_IFD, 4],
    [IFD1, 1],
  ] as const) {
    swap16(ifdAt)
    for (let i = 0; i < count; i += 1) {
      const at = ifdAt + 2 + i * 12
      const type = out[at + 2] | (out[at + 3] << 8)
      const count = out[at + 4] | (out[at + 5] << 8)
      const valueBytes = ({ 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[type] * count
      swap16(at)
      swap16(at + 2)
      swap32(at + 4)
      if (valueBytes > 4) {
        swap32(at + 8) // the slot holds an offset, whatever the value type is
      } else if (type === 3) {
        swap16(at + 8)
      } else if (type === 4) {
        swap32(at + 8)
      }
      // Inline ASCII stays byte-ordered.
    }
    swap32(ifdAt + 2 + count * 12)
  }
  for (let i = 0; i < 6; i += 1) {
    swap32(GPS_LAT_AT + i * 4)
    swap32(GPS_LON_AT + i * 4)
  }
  return out
}

function indexOfSequence(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

describe('fixture', () => {
  it('has the layout the offset constants describe', () => {
    expect(buildBlock().length).toBe(BLOCK_LENGTH)
  })
})

describe('isTiffBlock', () => {
  it('accepts both byte orders', () => {
    expect(isTiffBlock(buildBlock())).toBe(true)
    expect(isTiffBlock(toBigEndian(buildBlock()))).toBe(true)
  })

  it('rejects a bad magic and a truncated header', () => {
    const bad = buildBlock()
    bad[0] = 0x00
    expect(isTiffBlock(bad)).toBe(false)
    expect(isTiffBlock(new Uint8Array([0x49, 0x49, 0x2a]))).toBe(false)
  })

  it('rejects an IFD0 offset past the end', () => {
    const block = buildBlock()
    block.set(u32le(9999), 4)
    expect(isTiffBlock(block)).toBe(false)
  })
})

describe('summarizeTiffBlock', () => {
  it('reads camera, date, orientation and GPS', () => {
    const summary = summarizeTiffBlock(buildBlock())
    expect(summary).not.toBeNull()
    expect(summary?.camera).toBe('SONY ILCE-7M2')
    expect(summary?.dateTaken).toBe('2024:03:12 18:04:05')
    expect(summary?.orientation).toBe(6)
    expect(summary?.hasGps).toBe(true)
    expect(summary?.hasCamera).toBe(true)
    expect(summary?.hasDate).toBe(true)
    expect(summary?.hasThumbnail).toBe(true)
    expect(summary?.byteLength).toBe(BLOCK_LENGTH)
  })

  it('reports the same values in big-endian order', () => {
    const summary = summarizeTiffBlock(toBigEndian(buildBlock()))
    expect(summary?.camera).toBe('SONY ILCE-7M2')
    expect(summary?.orientation).toBe(6)
    expect(summary?.hasGps).toBe(true)
  })

  it('formats coordinates with their hemisphere', () => {
    const fields = summarizeTiffBlock(buildBlock())?.fields ?? []
    expect(fields).toContainEqual({ label: 'Latitude', value: '37.774983°N' })
    expect(fields).toContainEqual({ label: 'Longitude', value: '122.418942°W' })
    expect(fields).toContainEqual({ label: 'Dimensions', value: '4032×3024' })
  })

  it('reports no GPS when the pointer is absent', () => {
    expect(summarizeTiffBlock(buildBlock({ gps: false }))?.hasGps).toBe(false)
  })

  it('returns null rather than throwing on malformed input', () => {
    expect(summarizeTiffBlock(new Uint8Array([1, 2, 3]))).toBeNull()
    const block = buildBlock()
    block.set(u32le(9999), 4)
    expect(summarizeTiffBlock(block)).toBeNull()
  })
})

describe('patchTiffBlock', () => {
  const patch = { outputWidth: 800, outputHeight: 600, stripGps: false }

  it('forces orientation to 1', () => {
    const out = patchTiffBlock(buildBlock(), patch)
    expect(out).not.toBeNull()
    expect(summarizeTiffBlock(out!)?.orientation).toBe(1)
    expect(out![ORIENTATION_VALUE_AT]).toBe(1)
    expect(out![ORIENTATION_VALUE_AT + 1]).toBe(0)
  })

  it('rewrites the pixel dimension tags to the converted size', () => {
    const out = patchTiffBlock(buildBlock(), patch)
    expect(summarizeTiffBlock(out!)?.fields).toContainEqual({
      label: 'Dimensions',
      value: '800×600',
    })
  })

  it('drops the IFD1 thumbnail and trims the orphaned bytes', () => {
    const out = patchTiffBlock(buildBlock(), patch)
    expect(summarizeTiffBlock(out!)?.hasThumbnail).toBe(false)
    expect(out!.length).toBe(THUMBNAIL_AT)
  })

  it('keeps GPS when stripGps is false', () => {
    const out = patchTiffBlock(buildBlock(), patch)
    expect(summarizeTiffBlock(out!)?.hasGps).toBe(true)
    expect(indexOfSequence(out!, GPS_LATITUDE)).toBeGreaterThan(0)
  })

  it('erases the GPS coordinate bytes when stripGps is true', () => {
    const out = patchTiffBlock(buildBlock(), { ...patch, stripGps: true })
    expect(summarizeTiffBlock(out!)?.hasGps).toBe(false)
    // Unlinking the pointer is not enough — the coordinates must be gone.
    expect(indexOfSequence(out!, GPS_LATITUDE)).toBe(-1)
    expect(indexOfSequence(out!, GPS_LONGITUDE)).toBe(-1)
  })

  it('leaves the block intact when there is no thumbnail to reclaim', () => {
    const out = patchTiffBlock(buildBlock({ thumbnail: false }), patch)
    expect(out!.length).toBe(BLOCK_LENGTH)
  })

  it('aborts when a target tag is not size-stable', () => {
    // Orientation declared as RATIONAL cannot be overwritten in place.
    const block = buildBlock({ orientation: [5, 1, ...u16le(0)] })
    expect(patchTiffBlock(block, patch)).toBeNull()
  })

  it('returns null on malformed input', () => {
    expect(patchTiffBlock(new Uint8Array([1, 2, 3]), patch)).toBeNull()
  })

  it('terminates on an oversized entry count', () => {
    const block = buildBlock()
    block.set(u16le(9999), IFD0)
    expect(patchTiffBlock(block, patch)).toBeNull()
  })

  it('terminates on a self-referential IFD chain', () => {
    const block = buildBlock()
    block.set(u32le(IFD0), IFD0 + 2 + 5 * 12)
    expect(patchTiffBlock(block, patch)).not.toBeNull()
  })
})

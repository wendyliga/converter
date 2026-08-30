import { describe, expect, it } from 'vitest'
import {
  crc32,
  embedExifIntoJpeg,
  embedExifIntoPng,
  extractExifFromJpeg,
  extractExifFromPng,
  extractExifFromWebp,
} from './exifContainer'
import { MAX_EXIF_BYTES } from './limits'

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))
const u16be = (value: number) => [(value >>> 8) & 0xff, value & 0xff]
const u32be = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]
const u32le = (value: number) => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
]

const EXIF_SIGNATURE = ascii('Exif\0\0')
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// An empty but structurally valid TIFF block: the container layer treats it as
// opaque bytes, so this only has to be distinguishable.
const TIFF = new Uint8Array([...ascii('II'), 0x2a, 0x00, ...u32le(8), 0x00, 0x00, ...u32le(0)])

const APP0 = [0xff, 0xe0, ...u16be(16), ...ascii('JFIF\0'), ...new Array(9).fill(0)]
const DQT = [0xff, 0xdb, ...u16be(5), 1, 2, 3]
const SCAN = [0xff, 0xda, ...u16be(4), 0, 0, 0x11, 0x22, 0x33, 0xff, 0xd9]

const jpeg = (options: { app0?: boolean; exif?: Uint8Array } = {}) =>
  new Uint8Array([
    0xff,
    0xd8,
    ...(options.app0 === false ? [] : APP0),
    ...(options.exif
      ? [
          0xff,
          0xe1,
          ...u16be(2 + EXIF_SIGNATURE.length + options.exif.length),
          ...EXIF_SIGNATURE,
          ...options.exif,
        ]
      : []),
    ...DQT,
    ...SCAN,
  ])

const pngChunk = (type: string, data: number[]) => {
  const typeAndData = [...ascii(type), ...data]
  return [...u32be(data.length), ...typeAndData, ...u32be(crc32(new Uint8Array(typeAndData)))]
}

const png = (options: { exif?: Uint8Array } = {}) =>
  new Uint8Array([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', new Array(13).fill(1)),
    ...(options.exif ? pngChunk('eXIf', [...options.exif]) : []),
    ...pngChunk('IDAT', [9, 9, 9]),
    ...pngChunk('IEND', []),
  ])

const webp = (exifData: number[]) => {
  // A deliberately odd-sized VP8 chunk exercises the pad-to-even walk.
  const body = [
    ...ascii('WEBP'),
    ...ascii('VP8 '),
    ...u32le(5),
    1,
    2,
    3,
    4,
    5,
    0, // pad
    ...ascii('EXIF'),
    ...u32le(exifData.length),
    ...exifData,
  ]
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body])
}

describe('crc32', () => {
  it('matches the canonical PNG IEND vector', () => {
    expect(crc32(new Uint8Array(ascii('IEND')))).toBe(0xae426082)
  })

  it('matches the canonical check value for "123456789"', () => {
    expect(crc32(new Uint8Array(ascii('123456789')))).toBe(0xcbf43926)
  })
})

describe('extractExifFromJpeg', () => {
  it('finds the block after a JFIF APP0', () => {
    expect(extractExifFromJpeg(jpeg({ exif: TIFF }))).toEqual(TIFF)
  })

  it('finds the block when APP1 is the first segment', () => {
    expect(extractExifFromJpeg(jpeg({ app0: false, exif: TIFF }))).toEqual(TIFF)
  })

  it('returns null when there is no APP1', () => {
    expect(extractExifFromJpeg(jpeg())).toBeNull()
  })

  it('returns null when the segment length runs past the buffer', () => {
    const bytes = jpeg({ exif: TIFF })
    bytes.set(u16be(9999), 4 + APP0.length)
    expect(extractExifFromJpeg(bytes)).toBeNull()
  })

  it('returns null for non-JPEG input', () => {
    expect(extractExifFromJpeg(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})

describe('embedExifIntoJpeg', () => {
  it('round-trips the block byte for byte', () => {
    const out = embedExifIntoJpeg(jpeg(), TIFF)
    expect(extractExifFromJpeg(out)).toEqual(TIFF)
  })

  it('writes a correct APP1 header and keeps JFIF first', () => {
    const out = embedExifIntoJpeg(jpeg(), TIFF)
    expect([...out.subarray(0, 2 + APP0.length)]).toEqual([0xff, 0xd8, ...APP0])
    const at = 2 + APP0.length
    expect(out[at]).toBe(0xff)
    expect(out[at + 1]).toBe(0xe1)
    expect((out[at + 2] << 8) | out[at + 3]).toBe(2 + EXIF_SIGNATURE.length + TIFF.length)
  })

  it('inserts at the very front when there is no APP0', () => {
    const out = embedExifIntoJpeg(jpeg({ app0: false }), TIFF)
    expect(out[2]).toBe(0xff)
    expect(out[3]).toBe(0xe1)
    expect(extractExifFromJpeg(out)).toEqual(TIFF)
  })

  it('preserves the scan data', () => {
    const source = jpeg()
    const out = embedExifIntoJpeg(source, TIFF)
    expect([...out.subarray(out.length - SCAN.length)]).toEqual(SCAN)
    expect(out.length).toBe(source.length + 4 + EXIF_SIGNATURE.length + TIFF.length)
  })

  it('returns the input untouched when an APP1 already exists', () => {
    const source = jpeg({ exif: TIFF })
    expect(embedExifIntoJpeg(source, TIFF)).toBe(source)
  })

  it('returns the input untouched for an oversized block', () => {
    const source = jpeg()
    expect(embedExifIntoJpeg(source, new Uint8Array(MAX_EXIF_BYTES + 1))).toBe(source)
  })

  it('returns the input untouched for garbage', () => {
    const garbage = new Uint8Array([1, 2, 3, 4])
    expect(embedExifIntoJpeg(garbage, TIFF)).toBe(garbage)
  })
})

describe('extractExifFromPng', () => {
  it('finds an eXIf chunk before IDAT', () => {
    expect(extractExifFromPng(png({ exif: TIFF }))).toEqual(TIFF)
  })

  it('returns null when absent', () => {
    expect(extractExifFromPng(png())).toBeNull()
  })

  it('returns null for a bad signature', () => {
    const bytes = png({ exif: TIFF })
    bytes[1] = 0
    expect(extractExifFromPng(bytes)).toBeNull()
  })
})

describe('embedExifIntoPng', () => {
  it('round-trips the block', () => {
    expect(extractExifFromPng(embedExifIntoPng(png(), TIFF))).toEqual(TIFF)
  })

  it('places the chunk before the first IDAT with a valid CRC', () => {
    const out = embedExifIntoPng(png(), TIFF)
    const text = String.fromCharCode(...out)
    const exifAt = text.indexOf('eXIf')
    expect(exifAt).toBeGreaterThan(0)
    expect(exifAt).toBeLessThan(text.indexOf('IDAT'))
    expect([...out.subarray(0, 8)]).toEqual(PNG_SIGNATURE)

    const dataStart = exifAt + 4
    const typeAndData = out.subarray(exifAt, dataStart + TIFF.length)
    const written = out.subarray(dataStart + TIFF.length, dataStart + TIFF.length + 4)
    expect([...written]).toEqual(u32be(crc32(typeAndData)))
  })

  it('returns the input untouched when a chunk already exists or input is garbage', () => {
    const existing = png({ exif: TIFF })
    expect(embedExifIntoPng(existing, TIFF)).toBe(existing)
    const garbage = new Uint8Array([1, 2, 3, 4])
    expect(embedExifIntoPng(garbage, TIFF)).toBe(garbage)
  })
})

describe('extractExifFromWebp', () => {
  it('finds the EXIF chunk past an odd-sized chunk', () => {
    expect(extractExifFromWebp(webp([...TIFF]))).toEqual(TIFF)
  })

  it('strips a redundant Exif signature prefix', () => {
    expect(extractExifFromWebp(webp([...EXIF_SIGNATURE, ...TIFF]))).toEqual(TIFF)
  })

  it('returns null when there is no EXIF chunk or the input is not WebP', () => {
    const noExif = new Uint8Array([
      ...ascii('RIFF'),
      ...u32le(12),
      ...ascii('WEBP'),
      ...ascii('VP8 '),
      ...u32le(0),
    ])
    expect(extractExifFromWebp(noExif)).toBeNull()
    expect(extractExifFromWebp(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})

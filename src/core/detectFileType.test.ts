import { describe, expect, it } from 'vitest'
import { detectFromBytes, looksLikeSvg } from './detectFileType'

const bytes = (...values: number[]) => new Uint8Array(values)
const asciiBytes = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)))

describe('detectFromBytes', () => {
  it('detects png', () => {
    expect(detectFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png')
  })

  it('detects jpeg', () => {
    expect(detectFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
  })

  it('detects webp', () => {
    expect(detectFromBytes(asciiBytes('RIFF0000WEBPVP8 '))).toBe('webp')
  })

  it('detects avif', () => {
    expect(detectFromBytes(asciiBytes('0000ftypavif0000'))).toBe('avif')
  })

  it('detects heic so it can be rejected with a clear error', () => {
    expect(detectFromBytes(asciiBytes('0000ftypheic0000'))).toBe('heic')
  })

  it('detects bmp', () => {
    expect(detectFromBytes(asciiBytes('BM______'))).toBe('bmp')
  })

  it('detects ico', () => {
    expect(detectFromBytes(bytes(0, 0, 1, 0, 1, 0))).toBe('ico')
  })

  it('detects tiff in both byte orders', () => {
    expect(detectFromBytes(bytes(0x49, 0x49, 0x2a, 0x00))).toBe('tiff')
    expect(detectFromBytes(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe('tiff')
  })

  it('returns unknown for gif and random data', () => {
    expect(detectFromBytes(asciiBytes('GIF89a'))).toBe('unknown')
    expect(detectFromBytes(bytes(1, 2, 3, 4))).toBe('unknown')
  })
})

describe('looksLikeSvg', () => {
  it('accepts a bare svg root', () => {
    expect(looksLikeSvg('<svg xmlns="http://www.w3.org/2000/svg">')).toBe(true)
  })

  it('accepts an xml prologue followed by svg', () => {
    expect(looksLikeSvg('<?xml version="1.0"?>\n<svg>')).toBe(true)
  })

  it('rejects other xml documents', () => {
    expect(looksLikeSvg('<?xml version="1.0"?>\n<html>')).toBe(false)
  })

  it('rejects plain text', () => {
    expect(looksLikeSvg('hello world')).toBe(false)
  })
})

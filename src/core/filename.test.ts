import { describe, expect, it } from 'vitest'
import { buildOutputFilename, sanitizeBaseName } from './filename'

describe('sanitizeBaseName', () => {
  it('strips the original extension', () => {
    expect(sanitizeBaseName('photo.png')).toBe('photo')
  })

  it('removes unsafe characters', () => {
    expect(sanitizeBaseName('we/ird:na*me?.png')).toBe('weirdname')
  })

  it('falls back when nothing remains', () => {
    expect(sanitizeBaseName('???.png')).toBe('image')
  })

  it('keeps names without an extension', () => {
    expect(sanitizeBaseName('photo')).toBe('photo')
  })
})

describe('buildOutputFilename', () => {
  it('maps jpeg to a .jpg extension', () => {
    expect(buildOutputFilename('photo.png', 'jpeg', new Map())).toBe('photo.jpg')
  })

  it('numbers duplicate names case-insensitively', () => {
    const used = new Map<string, number>()
    expect(buildOutputFilename('photo.png', 'webp', used)).toBe('photo.webp')
    expect(buildOutputFilename('photo.jpg', 'webp', used)).toBe('photo-2.webp')
    expect(buildOutputFilename('PHOTO.jpeg', 'webp', used)).toBe('PHOTO-3.webp')
  })
})

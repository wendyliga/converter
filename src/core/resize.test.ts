import { describe, expect, it } from 'vitest'
import type { ResizeOptions } from '../types/image'
import { computeTargetSize } from './resize'

const base: ResizeOptions = { mode: 'original', preserveAspectRatio: true, preventUpscale: true }

describe('computeTargetSize', () => {
  it('keeps the original size', () => {
    expect(computeTargetSize(3000, 2000, base)).toEqual({ width: 3000, height: 2000 })
  })

  it('scales height when width is set and aspect ratio is preserved', () => {
    expect(computeTargetSize(3000, 2000, { ...base, mode: 'width', width: 1500 })).toEqual({
      width: 1500,
      height: 1000,
    })
  })

  it('keeps the source height when aspect ratio is not preserved', () => {
    expect(
      computeTargetSize(3000, 2000, {
        ...base,
        mode: 'width',
        width: 1500,
        preserveAspectRatio: false,
      }),
    ).toEqual({ width: 1500, height: 2000 })
  })

  it('prevents upscaling when enabled', () => {
    expect(computeTargetSize(800, 600, { ...base, mode: 'width', width: 1600 })).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('allows upscaling when disabled', () => {
    expect(
      computeTargetSize(800, 600, { ...base, mode: 'width', width: 1600, preventUpscale: false }),
    ).toEqual({ width: 1600, height: 1200 })
  })

  it('scales width when height is set', () => {
    expect(computeTargetSize(3000, 2000, { ...base, mode: 'height', height: 1000 })).toEqual({
      width: 1500,
      height: 1000,
    })
  })

  it('max width only shrinks larger images', () => {
    expect(computeTargetSize(3000, 2000, { ...base, mode: 'max-width', width: 1000 })).toEqual({
      width: 1000,
      height: 667,
    })
    expect(computeTargetSize(800, 600, { ...base, mode: 'max-width', width: 1000 })).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('max height only shrinks larger images', () => {
    expect(computeTargetSize(3000, 2000, { ...base, mode: 'max-height', height: 500 })).toEqual({
      width: 750,
      height: 500,
    })
    expect(computeTargetSize(800, 600, { ...base, mode: 'max-height', height: 1000 })).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('falls back to the source size when no dimension is provided', () => {
    expect(computeTargetSize(3000, 2000, { ...base, mode: 'width' })).toEqual({
      width: 3000,
      height: 2000,
    })
  })

  it('never returns dimensions below one pixel', () => {
    expect(computeTargetSize(10000, 2, { ...base, mode: 'width', width: 1 })).toEqual({
      width: 1,
      height: 1,
    })
  })
})

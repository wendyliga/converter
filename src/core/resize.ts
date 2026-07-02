import type { ResizeOptions } from '../types/image'

function round(value: number): number {
  return Math.max(1, Math.round(value))
}

export function computeTargetSize(
  srcWidth: number,
  srcHeight: number,
  resize: ResizeOptions,
): { width: number; height: number } {
  switch (resize.mode) {
    case 'width': {
      let width = resize.width ?? srcWidth
      if (resize.preventUpscale) width = Math.min(width, srcWidth)
      const height = resize.preserveAspectRatio ? (srcHeight * width) / srcWidth : srcHeight
      return { width: round(width), height: round(height) }
    }
    case 'height': {
      let height = resize.height ?? srcHeight
      if (resize.preventUpscale) height = Math.min(height, srcHeight)
      const width = resize.preserveAspectRatio ? (srcWidth * height) / srcHeight : srcWidth
      return { width: round(width), height: round(height) }
    }
    case 'max-width': {
      const limit = resize.width ?? srcWidth
      if (srcWidth <= limit) break
      return { width: round(limit), height: round((srcHeight * limit) / srcWidth) }
    }
    case 'max-height': {
      const limit = resize.height ?? srcHeight
      if (srcHeight <= limit) break
      return { width: round((srcWidth * limit) / srcHeight), height: round(limit) }
    }
    case 'original':
      break
  }
  return { width: round(srcWidth), height: round(srcHeight) }
}

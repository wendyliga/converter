import type { ImageInputType } from '../types/image'
import { ConverterError, ERRORS } from './errors'
import { readExifSummary } from './exifMetadata'
import type { ExifSummary } from './exifTiff'

const ALPHA_CAPABLE: ReadonlySet<ImageInputType> = new Set([
  'png',
  'webp',
  'avif',
  'svg',
  'ico',
  'heic',
  'tiff',
])
const DEFAULT_SVG_SIZE = 1024
const THUMBNAIL_SIZE = 96

export async function decodeToBitmap(file: File, inputFormat: ImageInputType): Promise<ImageBitmap> {
  if (inputFormat === 'svg') return decodeSvg(file)
  if (inputFormat === 'heic') {
    const { decodeHeic } = await import('../codecs/heicCodec')
    return decodeHeic(file)
  }
  if (inputFormat === 'tiff') {
    const { decodeTiff } = await import('../codecs/tiffCodec')
    return decodeTiff(file)
  }
  try {
    // Explicit rather than relying on the default: this used to be 'none' and
    // is 'from-image' now, and the EXIF preservation path depends on knowing
    // that the decoded pixels are already upright.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return decodeViaImageElement(file)
  }
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } catch {
    throw new ConverterError(ERRORS.decodeFailed)
  } finally {
    // decode() has already loaded the pixel data, so the URL can be released.
    URL.revokeObjectURL(url)
  }
}

async function decodeViaImageElement(file: File): Promise<ImageBitmap> {
  const image = await loadImageElement(file)
  if (!image.naturalWidth || !image.naturalHeight) throw new ConverterError(ERRORS.decodeFailed)
  return createImageBitmap(image)
}

// SVG is rasterized through an <img> element: createImageBitmap(file) rejects
// SVG blobs in several browsers, and untrusted SVG must never be inlined.
async function decodeSvg(file: File): Promise<ImageBitmap> {
  const image = await loadImageElement(file)
  const width = image.naturalWidth || DEFAULT_SVG_SIZE
  const height = image.naturalHeight || DEFAULT_SVG_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ConverterError(ERRORS.memory)
  context.drawImage(image, 0, 0, width, height)
  return createImageBitmap(canvas)
}

export type ProbeResult = {
  width: number
  height: number
  hasTransparency: boolean
  thumbnailUrl?: string
  metadata?: ExifSummary
}

// Decodes once to learn dimensions, sample transparency, and build a small
// uniform PNG thumbnail (safe to display for every input, including SVG).
export async function probeFile(file: File, inputFormat: ImageInputType): Promise<ProbeResult> {
  // Started before the decode so the two overlap; it never rejects, so it can
  // never turn a readable image into a failed one.
  const metadataPromise = readExifSummary(file, inputFormat)
  const bitmap = await decodeToBitmap(file, inputFormat)
  try {
    const { width, height } = bitmap
    const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(width, height))
    const thumbWidth = Math.max(1, Math.round(width * scale))
    const thumbHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = thumbWidth
    canvas.height = thumbHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return { width, height, hasTransparency: false, metadata: await metadataPromise }
    }
    context.drawImage(bitmap, 0, 0, thumbWidth, thumbHeight)

    let hasTransparency = false
    if (ALPHA_CAPABLE.has(inputFormat)) {
      const pixels = context.getImageData(0, 0, thumbWidth, thumbHeight).data
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) {
          hasTransparency = true
          break
        }
      }
    }

    const thumbnailBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    const thumbnailUrl = thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : undefined
    return { width, height, hasTransparency, thumbnailUrl, metadata: await metadataPromise }
  } finally {
    bitmap.close()
  }
}

import type { ConversionOptions, OutputFormat } from '../types/image'
import { ConverterError, ERRORS } from './errors'
import { computeTargetSize } from './resize'

export const OUTPUT_MIME: Record<OutputFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export type RenderResult = { blob: Blob; width: number; height: number }

// Runs on the main thread or inside a worker: OffscreenCanvas is preferred and
// is always available in workers; the DOM canvas is the main-thread fallback.
export async function renderToBlob(
  bitmap: ImageBitmap,
  options: ConversionOptions,
): Promise<RenderResult> {
  const { width, height } = computeTargetSize(bitmap.width, bitmap.height, options.resize)
  const mime = OUTPUT_MIME[options.outputFormat]
  const quality =
    options.outputFormat === 'png'
      ? undefined
      : Math.min(100, Math.max(1, options.quality)) / 100

  let blob: Blob | null = null
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new ConverterError(ERRORS.memory)
    draw(context, bitmap, width, height, options)
    try {
      blob = await canvas.convertToBlob({ type: mime, quality })
    } catch {
      throw new ConverterError(
        options.outputFormat === 'webp' ? ERRORS.outputUnsupported : ERRORS.memory,
      )
    }
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ConverterError(ERRORS.memory)
    draw(context, bitmap, width, height, options)
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
  }

  if (!blob) throw new ConverterError(ERRORS.memory)
  if (blob.type !== mime) throw new ConverterError(ERRORS.outputUnsupported)
  return { blob, width, height }
}

function draw(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  options: ConversionOptions,
): void {
  if (options.outputFormat === 'jpeg') {
    context.fillStyle = options.backgroundColor || '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
}

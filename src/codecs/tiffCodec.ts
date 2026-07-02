import UTIF from 'utif'
import { ConverterError, ERRORS } from '../core/errors'

// Lazy-loaded codec (PRD §17.3): UTIF.js is only downloaded the first time a
// TIFF file is added. Multi-page TIFFs decode their largest page.
export async function decodeTiff(file: File): Promise<ImageBitmap> {
  try {
    const buffer = await file.arrayBuffer()
    const ifds = UTIF.decode(buffer)
    if (ifds.length === 0) throw new Error('no pages')

    const page = ifds.reduce((best, candidate) => {
      const area = (dimension(candidate, 't256') ?? 0) * (dimension(candidate, 't257') ?? 0)
      const bestArea = (dimension(best, 't256') ?? 0) * (dimension(best, 't257') ?? 0)
      return area > bestArea ? candidate : best
    })

    UTIF.decodeImage(buffer, page)
    const rgba = UTIF.toRGBA8(page)
    const { width, height } = page
    if (!width || !height || rgba.length !== width * height * 4) {
      throw new Error('bad dimensions')
    }

    const pixels = new Uint8ClampedArray(
      rgba.buffer as ArrayBuffer,
      rgba.byteOffset,
      rgba.byteLength,
    )
    return await createImageBitmap(new ImageData(pixels, width, height))
  } catch {
    throw new ConverterError(ERRORS.tiffDecodeFailed)
  }
}

function dimension(ifd: UTIF.IFD, tag: 't256' | 't257'): number | undefined {
  const value = ifd[tag] as number[] | undefined
  return Array.isArray(value) ? value[0] : undefined
}

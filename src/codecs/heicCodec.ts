import { heicTo } from 'heic-to'
import { ConverterError, ERRORS } from '../core/errors'

// Lazy-loaded codec (PRD §17.3): this module and the libheif WASM it pulls in
// are only downloaded the first time a HEIC/HEIF file is added.
export async function decodeHeic(file: File): Promise<ImageBitmap> {
  try {
    return await heicTo({ blob: file, type: 'bitmap' })
  } catch {
    throw new ConverterError(ERRORS.heicDecodeFailed)
  }
}

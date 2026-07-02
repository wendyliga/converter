import { MAX_BATCH_COUNT } from './limits'

export class ConverterError extends Error {}

export const ERRORS = {
  unsupportedFormat:
    'This file type is not supported yet. Converter currently supports PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, and ICO.',
  heicDecodeFailed:
    'This HEIC file could not be decoded. It may use an unsupported variant — try exporting it as JPEG from your photo app first.',
  tiffDecodeFailed:
    'This TIFF file could not be decoded. Unusual or heavily compressed TIFF variants may not be supported.',
  decodeFailed:
    'Converter could not read this image. The file may be corrupted or unsupported.',
  tooLarge: 'This image is too large to process safely in your browser.',
  fileTooBig: 'This file is over the 50 MB limit.',
  outputUnsupported:
    'Your browser does not support this output format. Try PNG or JPEG.',
  memory:
    'Your browser ran out of memory while processing this image. Try a smaller image.',
  batchCount: `You can queue up to ${MAX_BATCH_COUNT} files at once. Extra files were skipped.`,
  batchBytes:
    'Adding these files would exceed the 200 MB batch limit. Some files were skipped.',
  conversionFailed:
    'Conversion failed unexpectedly. Try a different output format or a smaller image.',
  zipFailed: 'Could not create the ZIP archive. Try downloading files individually.',
} as const

export function errorMessage(err: unknown): string {
  if (err instanceof ConverterError) return err.message
  return ERRORS.conversionFailed
}

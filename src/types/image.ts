import type { ExifSummary } from '../core/exifTiff'

export type OutputFormat = 'png' | 'jpeg' | 'webp'

export type ImageInputType =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'avif'
  | 'svg'
  | 'bmp'
  | 'ico'
  | 'heic'
  | 'tiff'
  | 'unknown'

export type ConversionStatus =
  | 'queued'
  | 'validating'
  | 'ready'
  | 'converting'
  | 'done'
  | 'failed'
  | 'cancelled'

export type ResizeMode = 'original' | 'width' | 'height' | 'max-width' | 'max-height'

export type ResizeOptions = {
  mode: ResizeMode
  width?: number
  height?: number
  preserveAspectRatio: boolean
  preventUpscale: boolean
}

export type MetadataOptions = {
  // Off by default: the canvas re-encode already drops every tag, so keeping
  // metadata is an explicit re-injection the user has to ask for.
  keepMetadata: boolean
  // Only meaningful while keepMetadata is on.
  stripGps: boolean
}

export type ConversionOptions = {
  outputFormat: OutputFormat
  quality: number
  resize: ResizeOptions
  backgroundColor: string
  metadata: MetadataOptions
}

export type ConversionResult = {
  blob: Blob
  objectUrl: string
  filename: string
  outputFormat: OutputFormat
  sizeBytes: number
  width: number
  height: number
}

export type ImageFileItem = {
  id: string
  file: File
  name: string
  inputFormat?: ImageInputType
  sizeBytes: number
  width?: number
  height?: number
  hasTransparency?: boolean
  thumbnailUrl?: string
  metadata?: ExifSummary
  status: ConversionStatus
  error?: string
  result?: ConversionResult
}

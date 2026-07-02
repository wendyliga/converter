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

export type ConversionOptions = {
  outputFormat: OutputFormat
  quality: number
  resize: ResizeOptions
  backgroundColor: string
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
  status: ConversionStatus
  error?: string
  result?: ConversionResult
}

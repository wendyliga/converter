import type { ConversionOptions } from '../types/image'

export type WorkerRequest = {
  id: number
  bitmap: ImageBitmap
  options: ConversionOptions
}

export type WorkerResponse =
  | { id: number; ok: true; blob: Blob; width: number; height: number }
  | { id: number; ok: false; message: string }

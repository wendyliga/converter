import type { ConversionOptions, ImageInputType } from '../types/image'
import type { WorkerRequest, WorkerResponse } from '../workers/workerMessages'
import { renderToBlob, type RenderResult } from './canvasExport'
import { decodeToBitmap } from './decodeImage'
import { ConverterError, ERRORS } from './errors'
import { applyExif, METADATA_WRITE_FORMATS, readSourceExif } from './exifMetadata'

type PendingJob = {
  resolve: (result: RenderResult) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let requestSeq = 0
const pendingJobs = new Map<number, PendingJob>()

function failAllPending(message: string): void {
  for (const job of pendingJobs.values()) job.reject(new ConverterError(message))
  pendingJobs.clear()
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/convert.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return null
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const job = pendingJobs.get(event.data.id)
    if (!job) return
    pendingJobs.delete(event.data.id)
    if (event.data.ok) {
      job.resolve({ blob: event.data.blob, width: event.data.width, height: event.data.height })
    } else {
      job.reject(new ConverterError(event.data.message))
    }
  }
  worker.onerror = () => {
    failAllPending(ERRORS.conversionFailed)
    worker?.terminate()
    worker = null
  }
  return worker
}

// PRD §9.7 pipeline: decode on the main thread (SVG needs the DOM), then resize
// and encode inside a single worker so large rasters do not jank the UI.
export async function convertImage(
  file: File,
  inputFormat: ImageInputType,
  options: ConversionOptions,
): Promise<RenderResult> {
  const bitmap = await decodeToBitmap(file, inputFormat)
  const activeWorker = getWorker()

  const rendered = activeWorker
    ? await new Promise<RenderResult>((resolve, reject) => {
        const id = ++requestSeq
        pendingJobs.set(id, { resolve, reject })
        const request: WorkerRequest = { id, bitmap, options }
        activeWorker.postMessage(request, [bitmap])
      })
    : await renderMainThread(bitmap, options)

  return preserveMetadata(file, inputFormat, options, rendered)
}

async function renderMainThread(
  bitmap: ImageBitmap,
  options: ConversionOptions,
): Promise<RenderResult> {
  try {
    return await renderToBlob(bitmap, options)
  } finally {
    bitmap.close()
  }
}

// Runs on the main thread rather than in the worker: the worker only ever
// receives a transferred ImageBitmap and has no access to the source file, and
// splicing here keeps the worker protocol frozen and gives the main-thread
// fallback the same behavior for free.
async function preserveMetadata(
  file: File,
  inputFormat: ImageInputType,
  options: ConversionOptions,
  rendered: RenderResult,
): Promise<RenderResult> {
  if (!options.metadata.keepMetadata) return rendered
  if (!METADATA_WRITE_FORMATS.has(options.outputFormat)) return rendered

  // Re-read rather than caching the block on the queue item, so raw metadata
  // bytes never sit in React state for up to 50 files.
  const tiff = await readSourceExif(file, inputFormat)
  if (!tiff) return rendered

  const blob = await applyExif(
    rendered.blob,
    options.outputFormat,
    tiff,
    rendered.width,
    rendered.height,
    options.metadata.stripGps,
  )
  return { ...rendered, blob }
}

import type { ConversionOptions, ImageInputType } from '../types/image'
import type { WorkerRequest, WorkerResponse } from '../workers/workerMessages'
import { renderToBlob, type RenderResult } from './canvasExport'
import { decodeToBitmap } from './decodeImage'
import { ConverterError, ERRORS } from './errors'

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

  if (activeWorker) {
    return new Promise<RenderResult>((resolve, reject) => {
      const id = ++requestSeq
      pendingJobs.set(id, { resolve, reject })
      const request: WorkerRequest = { id, bitmap, options }
      activeWorker.postMessage(request, [bitmap])
    })
  }

  try {
    return await renderToBlob(bitmap, options)
  } finally {
    bitmap.close()
  }
}

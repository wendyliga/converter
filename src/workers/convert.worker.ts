import { renderToBlob } from '../core/canvasExport'
import { errorMessage } from '../core/errors'
import type { WorkerRequest, WorkerResponse } from './workerMessages'

// Typed view over the worker global scope; the DOM lib types `self` as Window.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse): void
}

scope.onmessage = async (event) => {
  const { id, bitmap, options } = event.data
  try {
    const { blob, width, height } = await renderToBlob(bitmap, options)
    scope.postMessage({ id, ok: true, blob, width, height })
  } catch (err) {
    scope.postMessage({ id, ok: false, message: errorMessage(err) })
  } finally {
    bitmap.close()
  }
}

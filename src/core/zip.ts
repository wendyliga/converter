import { zip } from 'fflate'
import { ConverterError, ERRORS } from './errors'

export type ZipEntry = { filename: string; blob: Blob }

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  // Images are already compressed, so entries are stored (level 0) for speed.
  const files: Record<string, [Uint8Array, { level: 0 }]> = {}
  for (const entry of entries) {
    let name = entry.filename
    let attempt = 2
    while (name in files) {
      const dot = entry.filename.lastIndexOf('.')
      name =
        dot > 0
          ? `${entry.filename.slice(0, dot)}-${attempt}${entry.filename.slice(dot)}`
          : `${entry.filename}-${attempt}`
      attempt += 1
    }
    files[name] = [new Uint8Array(await entry.blob.arrayBuffer()), { level: 0 }]
  }

  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, (error, data) => {
      if (error) reject(new ConverterError(ERRORS.zipFailed))
      else resolve(data)
    })
  })
  return new Blob([archive as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

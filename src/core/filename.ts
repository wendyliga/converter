import type { OutputFormat } from '../types/image'

const OUTPUT_EXTENSIONS: Record<OutputFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
}

export function sanitizeBaseName(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.')
  const base = lastDot > 0 ? originalName.slice(0, lastDot) : originalName
  const cleaned = Array.from(base)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  return cleaned || 'image'
}

export function buildOutputFilename(
  originalName: string,
  format: OutputFormat,
  usedNames: Map<string, number>,
): string {
  const base = sanitizeBaseName(originalName)
  const extension = OUTPUT_EXTENSIONS[format]
  const key = `${base.toLowerCase()}.${extension}`
  const count = (usedNames.get(key) ?? 0) + 1
  usedNames.set(key, count)
  return count === 1 ? `${base}.${extension}` : `${base}-${count}.${extension}`
}

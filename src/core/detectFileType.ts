import type { ImageInputType } from '../types/image'

export const SUPPORTED_INPUTS: ImageInputType[] = [
  'png',
  'jpeg',
  'webp',
  'avif',
  'heic',
  'tiff',
  'svg',
  'bmp',
  'ico',
]

export const FORMAT_LABELS: Record<ImageInputType, string> = {
  png: 'PNG',
  jpeg: 'JPG',
  webp: 'WebP',
  avif: 'AVIF',
  svg: 'SVG',
  bmp: 'BMP',
  ico: 'ICO',
  heic: 'HEIC',
  tiff: 'TIFF',
  unknown: 'Unknown',
}

export const FILE_INPUT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/heic',
  'image/heif',
  'image/tiff',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.bmp',
  '.ico',
  '.heic',
  '.heif',
  '.tif',
  '.tiff',
].join(',')

const MIME_MAP: Record<string, ImageInputType> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/tiff': 'tiff',
}

const EXTENSION_MAP: Record<string, ImageInputType> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  avif: 'avif',
  svg: 'svg',
  bmp: 'bmp',
  ico: 'ico',
  heic: 'heic',
  heif: 'heic',
  tif: 'tiff',
  tiff: 'tiff',
}

const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

export function detectFromBytes(bytes: Uint8Array): ImageInputType {
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp'
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase()
    if (brand.startsWith('avi')) return 'avif'
    if (HEIF_BRANDS.includes(brand)) return 'heic'
  }
  if (matches(bytes, 0, [0x42, 0x4d])) return 'bmp'
  if (matches(bytes, 0, [0x00, 0x00, 0x01, 0x00])) return 'ico'
  if (matches(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || matches(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'tiff'
  }
  return 'unknown'
}

export function looksLikeSvg(text: string): boolean {
  const head = text.replace(/^﻿/, '').trimStart().slice(0, 512).toLowerCase()
  if (head.startsWith('<svg')) return true
  const hasPrologue =
    head.startsWith('<?xml') || head.startsWith('<!doctype') || head.startsWith('<!--')
  return hasPrologue && head.includes('<svg')
}

export async function detectFileType(file: File): Promise<ImageInputType> {
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
    const byBytes = detectFromBytes(head)
    if (byBytes !== 'unknown') return byBytes
    const text = await file.slice(0, 1024).text()
    if (looksLikeSvg(text)) return 'svg'
  } catch {
    // Reading failed; fall through to metadata-based detection.
  }
  const byMime = MIME_MAP[file.type.toLowerCase()]
  if (byMime) return byMime
  const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSION_MAP[extension] ?? 'unknown'
}

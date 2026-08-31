import { useEffect, useRef, useState } from 'react'
import './App.css'
import { BackgroundPanel } from './components/BackgroundPanel'
import { Dropzone } from './components/Dropzone'
import { FileQueue } from './components/FileQueue'
import { Header } from './components/Header'
import { OutputFormatSelector } from './components/OutputFormatSelector'
import { MetadataPanel } from './components/MetadataPanel'
import { QualitySlider } from './components/QualitySlider'
import { ResizePanel } from './components/ResizePanel'
import { buildHref, buildVersion } from './core/buildInfo'
import { canEncode } from './core/browserSupport'
import { convertImage } from './core/convertImage'
import { detectFileType, FORMAT_LABELS, SUPPORTED_INPUTS } from './core/detectFileType'
import { probeFile } from './core/decodeImage'
import { ERRORS, errorMessage } from './core/errors'
import { buildOutputFilename } from './core/filename'
import {
  MAX_BATCH_BYTES,
  MAX_BATCH_COUNT,
  MAX_DIMENSION,
  MAX_FILE_BYTES,
  MAX_PIXELS,
} from './core/limits'
import { createZip } from './core/zip'
import type { ConversionOptions, ConversionStatus, ImageFileItem } from './types/image'

const DEFAULT_OPTIONS: ConversionOptions = {
  outputFormat: 'png',
  quality: 85,
  resize: { mode: 'original', preserveAspectRatio: true, preventUpscale: true },
  backgroundColor: '#ffffff',
  // Stripping is the default, and this is deliberately not persisted: a setting
  // that decides whether GPS coordinates leave in your files should not survive
  // a session without the user asking for it again.
  metadata: { keepMetadata: false, stripGps: true },
}

const CONVERTIBLE = new Set<ConversionStatus>(['ready', 'done', 'cancelled'])

// Every number in the spec footer comes from core/limits.ts, never a literal.
const MEGABYTE = 1024 * 1024
const INPUT_LABELS = SUPPORTED_INPUTS.map((format) => FORMAT_LABELS[format].toLowerCase())
const LIMIT_LINES = [
  `${Math.round(MAX_FILE_BYTES / MEGABYTE)} MB per file`,
  `${Math.round(MAX_BATCH_BYTES / MEGABYTE)} MB per batch`,
  `${MAX_BATCH_COUNT} files at once`,
  `${MAX_DIMENSION.toLocaleString('en-US')} px / ${Math.round(MAX_PIXELS / 1_000_000)} MP`,
]

function App() {
  const [items, setItems] = useState<ImageFileItem[]>([])
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_OPTIONS)
  const [webpSupported, setWebpSupported] = useState(true)
  const [isConverting, setIsConverting] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const itemsRef = useRef(items)
  const cancelRef = useRef(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    let alive = true
    canEncode('image/webp').then((supported) => {
      if (!alive) return
      setWebpSupported(supported)
      if (!supported) {
        setOptions((prev) =>
          prev.outputFormat === 'webp' ? { ...prev, outputFormat: 'png' } : prev,
        )
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const patchItem = (id: string, patch: Partial<ImageFileItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const releaseItem = (item: ImageFileItem) => {
    if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl)
    if (item.result) URL.revokeObjectURL(item.result.objectUrl)
  }

  const validateItem = async (stub: ImageFileItem) => {
    if (stub.file.size > MAX_FILE_BYTES) {
      patchItem(stub.id, { status: 'failed', error: ERRORS.fileTooBig })
      return
    }
    const inputFormat = await detectFileType(stub.file)
    if (!SUPPORTED_INPUTS.includes(inputFormat)) {
      patchItem(stub.id, { status: 'failed', inputFormat, error: ERRORS.unsupportedFormat })
      return
    }
    try {
      const probe = await probeFile(stub.file, inputFormat)
      const tooLarge =
        probe.width > MAX_DIMENSION ||
        probe.height > MAX_DIMENSION ||
        probe.width * probe.height > MAX_PIXELS
      if (tooLarge) {
        if (probe.thumbnailUrl) URL.revokeObjectURL(probe.thumbnailUrl)
        patchItem(stub.id, {
          status: 'failed',
          inputFormat,
          width: probe.width,
          height: probe.height,
          error: ERRORS.tooLarge,
        })
        return
      }
      patchItem(stub.id, {
        status: 'ready',
        inputFormat,
        width: probe.width,
        height: probe.height,
        hasTransparency: probe.hasTransparency,
        thumbnailUrl: probe.thumbnailUrl,
        metadata: probe.metadata,
      })
    } catch (err) {
      patchItem(stub.id, { status: 'failed', inputFormat, error: errorMessage(err) })
    }
  }

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    const current = itemsRef.current
    const notices: string[] = []
    let accepted = incoming
    const room = MAX_BATCH_COUNT - current.length
    if (accepted.length > room) {
      accepted = accepted.slice(0, Math.max(0, room))
      notices.push(ERRORS.batchCount)
    }
    let batchBytes = current.reduce((sum, item) => sum + item.sizeBytes, 0)
    const stubs: ImageFileItem[] = []
    for (const file of accepted) {
      if (batchBytes + file.size > MAX_BATCH_BYTES) {
        notices.push(ERRORS.batchBytes)
        break
      }
      batchBytes += file.size
      stubs.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        sizeBytes: file.size,
        status: 'validating',
      })
    }
    if (stubs.length > 0) setItems((prev) => [...prev, ...stubs])
    setNotice(notices[0] ?? null)
    for (const stub of stubs) void validateItem(stub)
  }

  const convertAll = async () => {
    if (isConverting) return
    const targetIds = itemsRef.current
      .filter((item) => CONVERTIBLE.has(item.status))
      .map((item) => item.id)
    if (targetIds.length === 0) return
    cancelRef.current = false
    setIsConverting(true)
    setNotice(null)
    const usedNames = new Map<string, number>()

    for (const id of targetIds) {
      const item = itemsRef.current.find((candidate) => candidate.id === id)
      if (!item) continue
      if (cancelRef.current) {
        if (item.status !== 'done') patchItem(id, { status: 'cancelled' })
        continue
      }
      if (item.result) URL.revokeObjectURL(item.result.objectUrl)
      patchItem(id, { status: 'converting', error: undefined, result: undefined })
      try {
        const { blob, width, height } = await convertImage(
          item.file,
          item.inputFormat ?? 'unknown',
          options,
        )
        const filename = buildOutputFilename(item.name, options.outputFormat, usedNames)
        patchItem(id, {
          status: 'done',
          result: {
            blob,
            objectUrl: URL.createObjectURL(blob),
            filename,
            outputFormat: options.outputFormat,
            sizeBytes: blob.size,
            width,
            height,
          },
        })
      } catch (err) {
        patchItem(id, { status: 'failed', error: errorMessage(err) })
      }
    }
    setIsConverting(false)
    if (cancelRef.current) setNotice('Conversion cancelled.')
  }

  const cancelConversion = () => {
    cancelRef.current = true
  }

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === id)
    if (item) releaseItem(item)
    setItems((prev) => prev.filter((candidate) => candidate.id !== id))
  }

  const clearQueue = () => {
    for (const item of itemsRef.current) releaseItem(item)
    setItems([])
    setNotice(null)
  }

  const downloadZip = async () => {
    const done = itemsRef.current.filter((item) => item.status === 'done' && item.result)
    if (done.length === 0 || isZipping) return
    setIsZipping(true)
    try {
      const blob = await createZip(
        done.map((item) => ({ filename: item.result!.filename, blob: item.result!.blob })),
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'converter-images.zip'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setNotice(ERRORS.zipFailed)
    } finally {
      setIsZipping(false)
    }
  }

  const convertibleCount = items.filter((item) => CONVERTIBLE.has(item.status)).length
  const transparencyRisk = items.some((item) => item.hasTransparency)
  const filesWithGps = items.filter((item) => item.metadata?.hasGps).length

  return (
    <div className="app">
      <Header />

      <main>
        <div className="region-inner main-inner">
          <div className="work-column">
            <Dropzone onFiles={addFiles} />

            {notice && (
              <p className="notice" role="status">
                {notice}
                <button
                  type="button"
                  className="notice-dismiss"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss message"
                >
                  ×
                </button>
              </p>
            )}

            <FileQueue
              items={items}
              outputFormat={options.outputFormat}
              convertibleCount={convertibleCount}
              isConverting={isConverting}
              isZipping={isZipping}
              onRemove={removeItem}
              onClear={clearQueue}
              onConvert={convertAll}
              onCancel={cancelConversion}
              onDownloadZip={downloadZip}
            />
          </div>

          <aside className="settings" aria-label="Conversion settings">
            <div className="settings-bar">Settings</div>
            <div className="settings-sections">
              <OutputFormatSelector
                value={options.outputFormat}
                webpSupported={webpSupported}
                onChange={(outputFormat) => setOptions((prev) => ({ ...prev, outputFormat }))}
              />
              <QualitySlider
                value={options.quality}
                disabled={options.outputFormat === 'png'}
                onChange={(quality) => setOptions((prev) => ({ ...prev, quality }))}
              />
              <ResizePanel
                value={options.resize}
                onChange={(resize) => setOptions((prev) => ({ ...prev, resize }))}
              />
              {options.outputFormat === 'jpeg' && (
                <BackgroundPanel
                  value={options.backgroundColor}
                  transparencyRisk={transparencyRisk}
                  onChange={(backgroundColor) =>
                    setOptions((prev) => ({ ...prev, backgroundColor }))
                  }
                />
              )}
              <MetadataPanel
                value={options.metadata}
                outputFormat={options.outputFormat}
                totalFiles={items.length}
                filesWithGps={filesWithGps}
                onChange={(metadata) => setOptions((prev) => ({ ...prev, metadata }))}
              />
            </div>
          </aside>
        </div>
      </main>

      <section className="spec" aria-label="Reference">
        <div className="region-inner spec-inner">
          <div className="spec-column">
            <h2>Input formats</h2>
            <p className="spec-mono">
              {INPUT_LABELS.slice(0, 4).join(' · ')}
              <br />
              {INPUT_LABELS.slice(4).join(' · ')}
            </p>
            <p className="spec-note">
              AVIF/BMP/ICO depend on your browser. HEIC and TIFF decoders load on first use.
            </p>
          </div>
          <div className="spec-column">
            <h2>Output</h2>
            <p className="spec-body">
              <strong>png</strong> lossless, keeps alpha
              <br />
              <strong>jpg</strong> small, no alpha
              <br />
              <strong>webp</strong> efficient, never carries EXIF
            </p>
          </div>
          <div className="spec-column">
            <h2>Limits</h2>
            <p className="spec-mono is-secondary">
              {LIMIT_LINES.map((line, index) => (
                <span key={line}>
                  {index > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="region-inner footer-inner">
          <span>MIT licensed</span>
          <a className="footer-link" href={buildHref} target="_blank" rel="noopener noreferrer">
            build {buildVersion}
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App

import { useEffect, useRef, useState } from 'react'
import './App.css'
import { Dropzone } from './components/Dropzone'
import { FileQueue } from './components/FileQueue'
import { Header } from './components/Header'
import { OutputFormatSelector } from './components/OutputFormatSelector'
import { QualitySlider } from './components/QualitySlider'
import { ResizePanel } from './components/ResizePanel'
import { canEncode } from './core/browserSupport'
import { convertImage } from './core/convertImage'
import { detectFileType, FORMAT_LABELS, SUPPORTED_INPUTS } from './core/detectFileType'
import { probeFile } from './core/decodeImage'
import { ERRORS, errorMessage } from './core/errors'
import { buildOutputFilename } from './core/filename'
import { formatBytes } from './core/formatBytes'
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
}

const CONVERTIBLE = new Set<ConversionStatus>(['ready', 'done', 'cancelled'])

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

  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0)
  const convertibleCount = items.filter((item) => CONVERTIBLE.has(item.status)).length
  const doneCount = items.filter((item) => item.status === 'done').length
  const transparencyRisk =
    options.outputFormat === 'jpeg' && items.some((item) => item.hasTransparency)

  return (
    <div className="app-shell" id="top">
      <Header />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <p className="hero-eyebrow">100% local · nothing leaves your device</p>
          <h1 id="hero-title">Convert images privately in your browser.</h1>
          <p className="hero-subtitle">
            Convert PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, and ICO without uploading
            files to a server. No account, no tracking, no waiting on uploads.
          </p>
        </section>

        <section className="converter-card" id="converter" aria-label="Image converter">
          <Dropzone onFiles={addFiles} />

          {notice && (
            <p className="queue-notice" role="status">
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

          <div className="settings-grid">
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
          </div>

          {options.outputFormat === 'jpeg' && (
            <div className={`background-row${transparencyRisk ? ' is-warning' : ''}`}>
              {transparencyRisk && (
                <p className="transparency-warning" role="alert">
                  <strong>Heads up:</strong> JPEG does not support transparency. Transparent
                  areas will be filled with the selected background color.
                </p>
              )}
              <label className="background-picker">
                Background for transparency
                <input
                  type="color"
                  value={options.backgroundColor}
                  onChange={(event) =>
                    setOptions((prev) => ({ ...prev, backgroundColor: event.target.value }))
                  }
                />
              </label>
            </div>
          )}

          <FileQueue items={items} outputFormat={options.outputFormat} onRemove={removeItem} />

          <div className="convert-bar">
            <p className="convert-summary">
              {items.length === 0
                ? 'No images added yet'
                : `${items.length} image${items.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
            </p>
            <div className="convert-actions">
              {items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearQueue}
                  disabled={isConverting}
                >
                  Clear all
                </button>
              )}
              {doneCount >= 2 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={downloadZip}
                  disabled={isZipping || isConverting}
                >
                  {isZipping ? 'Zipping…' : 'Download all (.zip)'}
                </button>
              )}
              {isConverting && (
                <button type="button" className="btn btn-secondary" onClick={cancelConversion}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={convertAll}
                disabled={isConverting || convertibleCount === 0}
              >
                {isConverting
                  ? 'Converting…'
                  : convertibleCount > 1
                    ? `Convert ${convertibleCount} images`
                    : 'Convert'}
              </button>
            </div>
          </div>
        </section>

        <section className="trust-grid" aria-label="Why Converter">
          <article>
            <h2>Private by design</h2>
            <p>
              Your images are processed locally in your browser and are not uploaded to our
              server.
            </p>
          </article>
          <article>
            <h2>Fast and free</h2>
            <p>No account, no queue, no upload wait. Conversion starts instantly on your device.</p>
          </article>
          <article>
            <h2>Batch friendly</h2>
            <p>
              Queue up to {MAX_BATCH_COUNT} images, convert them in one click, and download
              everything as a ZIP.
            </p>
          </article>
        </section>

        <section className="formats" id="formats" aria-labelledby="formats-title">
          <h2 id="formats-title">Supported formats</h2>
          <div className="formats-grid">
            <div>
              <h3>Input</h3>
              <ul className="format-chips">
                {SUPPORTED_INPUTS.map((format) => (
                  <li key={format}>{FORMAT_LABELS[format]}</li>
                ))}
              </ul>
              <p className="formats-note">
                AVIF, BMP, and ICO support depends on your browser&apos;s built-in decoders.
                HEIC and TIFF decoders load on demand the first time you add one.
              </p>
            </div>
            <div>
              <h3>Output</h3>
              <ul className="format-chips">
                <li>PNG — lossless, keeps transparency</li>
                <li>JPG — small files, no transparency</li>
                <li>WebP — modern and efficient</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="faq" id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Frequently asked questions</h2>
          <div className="faq-grid">
            <article>
              <h3>Are my images uploaded anywhere?</h3>
              <p>
                No. Conversion runs entirely in your browser using its built-in image tools.
                Files never leave your device.
              </p>
            </article>
            <article>
              <h3>Which conversions are supported?</h3>
              <p>
                PNG, JPG, WebP, AVIF, HEIC, TIFF, SVG, BMP, and ICO can be converted to PNG,
                JPG, or WebP.
              </p>
            </article>
            <article>
              <h3>What are the limits?</h3>
              <p>
                Up to 50 MB per file, 200 MB per batch, {MAX_BATCH_COUNT} files at once, and
                12,000 px or 100 megapixels per image.
              </p>
            </article>
            <article>
              <h3>Is metadata preserved?</h3>
              <p>
                No. EXIF data and color profiles are not preserved — which also means location
                data is stripped from your photos.
              </p>
            </article>
            <article>
              <h3>Why is WebP disabled?</h3>
              <p>
                WebP export depends on your browser. If it can&apos;t encode WebP, the option is
                disabled — PNG and JPG always work.
              </p>
            </article>
            <article>
              <h3>What about HEIC or TIFF?</h3>
              <p>
                Supported. iPhone HEIC photos and TIFF files decode locally with extra
                decoders that download only when you add one, keeping the first load fast.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell-inner footer-inner">
          <span>Converter</span>
          <span>No upload · No account · No server processing</span>
        </div>
      </footer>
    </div>
  )
}

export default App

import { formatBytes } from '../core/formatBytes'
import type { ImageFileItem, OutputFormat } from '../types/image'
import { FileCard } from './FileCard'

type Props = {
  items: ImageFileItem[]
  outputFormat: OutputFormat
  convertibleCount: number
  isConverting: boolean
  isZipping: boolean
  onRemove: (id: string) => void
  onClear: () => void
  onConvert: () => void
  onCancel: () => void
  onDownloadZip: () => void
}

function countBy(items: ImageFileItem[], predicate: (item: ImageFileItem) => boolean): number {
  return items.reduce((total, item) => (predicate(item) ? total + 1 : total), 0)
}

export function FileQueue({
  items,
  outputFormat,
  convertibleCount,
  isConverting,
  isZipping,
  onRemove,
  onClear,
  onConvert,
  onCancel,
  onDownloadZip,
}: Props) {
  if (items.length === 0) return null

  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0)
  const checking = countBy(items, (item) => item.status === 'queued' || item.status === 'validating')
  const ready = countBy(items, (item) => item.status === 'ready' || item.status === 'cancelled')
  const working = countBy(items, (item) => item.status === 'converting')
  const done = countBy(items, (item) => item.status === 'done')
  const failed = countBy(items, (item) => item.status === 'failed')

  const summary =
    [
      checking > 0 ? `${checking} checking` : null,
      ready > 0 ? `${ready} ready` : null,
      working > 0 ? `${working} working` : null,
      done > 0 ? `${done} done` : null,
      failed > 0 ? `${failed} failed` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—'

  return (
    <section className="queue" aria-label="File queue">
      <div className="queue-bar">
        <span className="queue-bar-label">
          Queue — {items.length} file{items.length === 1 ? '' : 's'}, {formatBytes(totalBytes)}
        </span>
        <button type="button" className="btn-quiet" onClick={onClear} disabled={isConverting}>
          Clear
        </button>
      </div>

      <div className="queue-head" aria-hidden="true">
        <span />
        <span>File</span>
        <span>Conversion</span>
        <span>Size</span>
        <span>Metadata</span>
        <span className="col-status">Status</span>
        <span />
      </div>

      <ul className="queue-list" aria-live="polite">
        {items.map((item) => (
          <FileCard key={item.id} item={item} outputFormat={outputFormat} onRemove={onRemove} />
        ))}
      </ul>

      <div className="queue-foot">
        <span className="queue-summary">{summary}</span>
        <div className="queue-actions">
          {isConverting && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          {done > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onDownloadZip}
              disabled={isZipping || isConverting}
            >
              {isZipping ? 'Zipping…' : 'Download .zip'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConvert}
            disabled={isConverting || convertibleCount === 0}
          >
            {isConverting
              ? 'Converting…'
              : `Convert ${convertibleCount} file${convertibleCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </section>
  )
}

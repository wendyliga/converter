import { FORMAT_LABELS } from '../core/detectFileType'
import { formatBytes } from '../core/formatBytes'
import type { ConversionStatus, ImageFileItem, OutputFormat } from '../types/image'

const STATUS_LABELS: Record<ConversionStatus, string> = {
  queued: 'Queued',
  validating: 'Checking…',
  ready: 'Ready',
  converting: 'Converting…',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

type Props = {
  item: ImageFileItem
  outputFormat: OutputFormat
  onRemove: (id: string) => void
}

export function FileCard({ item, outputFormat, onRemove }: Props) {
  const { status, result } = item
  const isDone = status === 'done' && result !== undefined
  const previewUrl = isDone ? result.objectUrl : item.thumbnailUrl
  const savings =
    isDone && item.sizeBytes > 0
      ? Math.round((1 - result.sizeBytes / item.sizeBytes) * 100)
      : null

  // Conversion direction: the actual result once done, otherwise what the
  // currently selected output format will turn this file into.
  const fromLabel =
    item.inputFormat && item.inputFormat !== 'unknown' ? FORMAT_LABELS[item.inputFormat] : null
  const toLabel = FORMAT_LABELS[isDone ? result.outputFormat : outputFormat]
  const showTransition = fromLabel !== null && status !== 'failed'

  const dimensions = isDone
    ? `${result.width}×${result.height}`
    : item.width && item.height
      ? `${item.width}×${item.height}`
      : null
  const size = formatBytes(isDone ? result.sizeBytes : item.sizeBytes)

  return (
    <li className={`file-card is-${status}`}>
      {previewUrl ? (
        <img className="file-thumb" src={previewUrl} alt="" width={48} height={48} />
      ) : (
        <span className="file-thumb file-thumb-empty" aria-hidden="true">
          {status === 'failed' ? '!' : '…'}
        </span>
      )}
      <div className="file-body">
        <p className="file-name">{isDone ? result.filename : item.name}</p>
        {showTransition && (
          <p
            className="format-transition"
            aria-label={`Converts ${fromLabel} to ${toLabel}`}
          >
            <span className="format-from">{fromLabel}</span>
            <span className="format-arrow" aria-hidden="true">
              →
            </span>
            <span className="format-to">{toLabel}</span>
          </p>
        )}
        <p className="file-meta">
          {!showTransition && item.inputFormat ? `${FORMAT_LABELS[item.inputFormat]} · ` : ''}
          {size}
          {dimensions ? ` · ${dimensions}` : ''}
          {savings !== null && savings !== 0 && (
            <span className={savings > 0 ? 'file-savings' : 'file-growth'}>
              {' · '}
              {savings > 0 ? `${savings}% smaller` : `${Math.abs(savings)}% larger`}
            </span>
          )}
        </p>
        {status === 'failed' && item.error && (
          <p className="file-error" role="alert">
            {item.error}
          </p>
        )}
      </div>
      <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>
      <div className="file-actions">
        {isDone && (
          <a
            className="btn btn-primary btn-small"
            href={result.objectUrl}
            download={result.filename}
          >
            Download
          </a>
        )}
        {status !== 'converting' && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.name}`}
          >
            Remove
          </button>
        )}
      </div>
    </li>
  )
}

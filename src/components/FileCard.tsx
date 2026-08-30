import { Fragment, useId, useState, type ReactNode } from 'react'
import { FORMAT_LABELS } from '../core/detectFileType'
import { formatBytes } from '../core/formatBytes'
import type { ConversionStatus, ImageFileItem, OutputFormat } from '../types/image'

const STATUS_LABELS: Record<ConversionStatus, string> = {
  queued: 'Queued',
  validating: 'Checking…',
  ready: 'Ready',
  converting: 'Working…',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const STATUS_CLASS: Partial<Record<ConversionStatus, string>> = {
  ready: 'is-ready',
  done: 'is-done',
  failed: 'is-failed',
}

// Row chips are abbreviated so four of them fit the 128px metadata column.
const GPS_FIELDS = new Set(['Latitude', 'Longitude'])

type Props = {
  item: ImageFileItem
  outputFormat: OutputFormat
  onRemove: (id: string) => void
}

export function FileCard({ item, outputFormat, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false)
  const detailId = useId()

  const { status, result, metadata } = item
  const isDone = status === 'done' && result !== undefined
  const previewUrl = isDone ? result.objectUrl : item.thumbnailUrl

  const fromLabel =
    item.inputFormat && item.inputFormat !== 'unknown' ? FORMAT_LABELS[item.inputFormat] : '—'
  const toLabel = FORMAT_LABELS[isDone ? result.outputFormat : outputFormat]

  const dimensions = isDone
    ? `${result.width}×${result.height}`
    : item.width && item.height
      ? `${item.width}×${item.height}`
      : null

  const savings =
    isDone && item.sizeBytes > 0
      ? Math.round((1 - result.sizeBytes / item.sizeBytes) * 100)
      : null

  const conversion = (
    <span className="cell-conversion">
      {fromLabel} → <strong>{toLabel}</strong>
    </span>
  )

  const size = (
    <span className="cell-size">
      {formatBytes(isDone ? result.sizeBytes : item.sizeBytes)}
      {savings !== null && savings !== 0 && (
        <>
          {' '}
          <span className={savings > 0 ? 'size-savings' : 'size-growth'}>
            {savings > 0 ? `−${savings}%` : `+${Math.abs(savings)}%`}
          </span>
        </>
      )}
    </span>
  )

  const chips: ReactNode[] = []
  if (metadata) {
    if (metadata.hasGps) {
      chips.push(
        <span key="gps" className="chip is-gps">
          GPS
        </span>,
      )
    }
    if (metadata.hasCamera) {
      chips.push(
        <span key="cam" className="chip">
          CAM
        </span>,
      )
    }
    if (metadata.hasDate) {
      chips.push(
        <span key="date" className="chip">
          DATE
        </span>,
      )
    }
    if (metadata.hasThumbnail) {
      chips.push(
        <span key="thumb" className="chip">
          THUMB
        </span>,
      )
    }
    // A block can hold fields without matching any of the headline flags — an
    // Orientation-only APP1 is common. Without this the cell renders an empty,
    // zero-width button that cannot be clicked and says nothing.
    if (chips.length === 0) {
      chips.push(
        <span key="exif" className="chip">
          EXIF
        </span>,
      )
    }
  }

  const metadataCell = (
    <div className="cell-metadata">
      {metadata ? (
        <button
          type="button"
          className="metadata-toggle"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => setExpanded((open) => !open)}
          title={`${metadata.fields.length} metadata field${
            metadata.fields.length === 1 ? '' : 's'
          }`}
        >
          {chips}
        </button>
      ) : (
        <span className="metadata-empty">none</span>
      )}
    </div>
  )

  return (
    <li className={`queue-item${metadata?.hasGps ? ' has-gps' : ''}`}>
      <div className="queue-row">
        <span className="cell-thumb">
          {previewUrl ? (
            <img src={previewUrl} alt="" width={40} height={40} />
          ) : (
            <span className="thumb-placeholder" aria-hidden="true" />
          )}
        </span>

        <div className="cell-file">
          <p className="file-name" title={isDone ? result.filename : item.name}>
            {isDone ? result.filename : item.name}
          </p>
          {dimensions && <p className="file-dimensions">{dimensions}</p>}
          <div className="file-stacked">
            {conversion}
            {size}
            {metadataCell}
          </div>
        </div>

        {conversion}
        {size}
        {metadataCell}

        {isDone ? (
          <a
            className="cell-status is-done"
            href={result.objectUrl}
            download={result.filename}
            title={`Download ${result.filename}`}
          >
            Done ↓
          </a>
        ) : (
          <span className={`cell-status ${STATUS_CLASS[status] ?? ''}`}>
            {STATUS_LABELS[status]}
          </span>
        )}

        <button
          type="button"
          className="row-remove"
          onClick={() => onRemove(item.id)}
          disabled={status === 'converting'}
          aria-label={`Remove ${item.name}`}
          title={`Remove ${item.name}`}
        >
          ×
        </button>
      </div>

      {status === 'failed' && item.error && (
        <p className="row-error" role="alert">
          {item.error}
        </p>
      )}

      {metadata && expanded && (
        <dl className="row-detail" id={detailId}>
          {metadata.fields.map((field) => {
            const gps = GPS_FIELDS.has(field.label)
            return (
              <Fragment key={field.label}>
                <dt className={gps ? 'is-gps' : undefined}>{field.label}</dt>
                <dd className={gps ? 'is-gps' : undefined}>{field.value}</dd>
              </Fragment>
            )
          })}
        </dl>
      )}
    </li>
  )
}

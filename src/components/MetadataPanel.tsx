import type { MetadataOptions, OutputFormat } from '../types/image'

type Props = {
  value: MetadataOptions
  outputFormat: OutputFormat
  totalFiles: number
  filesWithGps: number
  onChange: (metadata: MetadataOptions) => void
}

export function MetadataPanel({
  value,
  outputFormat,
  totalFiles,
  filesWithGps,
  onChange,
}: Props) {
  // WebP output would need its container rewritten to carry a metadata chunk.
  const supported = outputFormat !== 'webp'
  const keeping = supported && value.keepMetadata

  return (
    <div className="settings-section is-metadata">
      <div className="control-head">
        <span className="control-label">Metadata (EXIF)</span>
        {filesWithGps > 0 && <span className="metadata-count">{filesWithGps} GPS</span>}
      </div>
      <label className="checkbox-option metadata-option">
        <input
          type="checkbox"
          checked={keeping}
          disabled={!supported}
          onChange={(event) => onChange({ ...value, keepMetadata: event.target.checked })}
        />
        Keep camera metadata
      </label>
      <label className="checkbox-option metadata-option metadata-sub">
        <input
          type="checkbox"
          checked={value.stripGps}
          disabled={!keeping}
          onChange={(event) => onChange({ ...value, stripGps: event.target.checked })}
        />
        Remove GPS location
      </label>
      {supported && filesWithGps > 0 && (
        <p className="metadata-warning">
          {filesWithGps} of {totalFiles} file{totalFiles === 1 ? '' : 's'}{' '}
          {filesWithGps === 1 ? 'carries' : 'carry'} GPS. With this on, those coordinates are
          written into the output.
        </p>
      )}
      <p className="control-note">
        Off = every tag stripped (default). Orientation and size tags are corrected; the embedded
        thumbnail is dropped. WebP never carries metadata.
      </p>
    </div>
  )
}

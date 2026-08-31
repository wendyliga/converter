import { MAX_DIMENSION } from '../core/limits'
import type { ResizeMode, ResizeOptions } from '../types/image'

const MODES: { value: ResizeMode; label: string }[] = [
  { value: 'original', label: 'Original size' },
  { value: 'width', label: 'Set width' },
  { value: 'height', label: 'Set height' },
  { value: 'max-width', label: 'Max width' },
  { value: 'max-height', label: 'Max height' },
]

type Props = {
  value: ResizeOptions
  onChange: (resize: ResizeOptions) => void
}

export function ResizePanel({ value, onChange }: Props) {
  const usesHeight = value.mode === 'height' || value.mode === 'max-height'
  const isMaxMode = value.mode === 'max-width' || value.mode === 'max-height'
  const dimensionValue = usesHeight ? value.height : value.width
  const dimensionLabel = usesHeight
    ? isMaxMode
      ? 'Max height (px)'
      : 'Height (px)'
    : isMaxMode
      ? 'Max width (px)'
      : 'Width (px)'

  const setDimension = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    const next = Number.isNaN(parsed)
      ? undefined
      : Math.min(MAX_DIMENSION, Math.max(1, parsed))
    onChange(usesHeight ? { ...value, height: next } : { ...value, width: next })
  }

  return (
    <div className="settings-section">
      <label className="control-label" htmlFor="resize-mode">
        Resize
      </label>
      <select
        id="resize-mode"
        className="control-select"
        value={value.mode}
        onChange={(event) => onChange({ ...value, mode: event.target.value as ResizeMode })}
      >
        {MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
      {value.mode !== 'original' && (
        <input
          className="control-number"
          type="number"
          min={1}
          max={MAX_DIMENSION}
          placeholder={dimensionLabel}
          aria-label={dimensionLabel}
          value={dimensionValue ?? ''}
          onChange={(event) => setDimension(event.target.value)}
        />
      )}
      <label className="checkbox-option">
        <input
          type="checkbox"
          checked={value.preserveAspectRatio}
          disabled={value.mode === 'original' || isMaxMode}
          onChange={(event) => onChange({ ...value, preserveAspectRatio: event.target.checked })}
        />
        Preserve aspect ratio
      </label>
      <label className="checkbox-option">
        <input
          type="checkbox"
          checked={value.preventUpscale}
          disabled={value.mode === 'original' || isMaxMode}
          onChange={(event) => onChange({ ...value, preventUpscale: event.target.checked })}
        />
        Never enlarge
      </label>
    </div>
  )
}

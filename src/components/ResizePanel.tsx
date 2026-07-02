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
    <fieldset className="control-block resize-panel">
      <legend className="control-label">Resize</legend>
      <div className="resize-modes">
        {MODES.map((mode) => (
          <label key={mode.value} className="radio-option">
            <input
              type="radio"
              name="resize-mode"
              value={mode.value}
              checked={value.mode === mode.value}
              onChange={() => onChange({ ...value, mode: mode.value })}
            />
            {mode.label}
          </label>
        ))}
      </div>
      {value.mode !== 'original' && (
        <label className="resize-dimension">
          {dimensionLabel}
          <input
            type="number"
            min={1}
            max={MAX_DIMENSION}
            placeholder="e.g. 1920"
            value={dimensionValue ?? ''}
            onChange={(event) => setDimension(event.target.value)}
          />
        </label>
      )}
      <div className="resize-toggles">
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
          Do not enlarge smaller images
        </label>
      </div>
    </fieldset>
  )
}

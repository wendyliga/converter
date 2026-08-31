type Props = {
  value: number
  disabled: boolean
  onChange: (quality: number) => void
}

export function QualitySlider({ value, disabled, onChange }: Props) {
  return (
    <div className="settings-section">
      <label className="control-label control-head" htmlFor="quality-slider">
        Quality
        <output className="control-value" htmlFor="quality-slider">
          {disabled ? 'n/a' : value}
        </output>
      </label>
      <input
        id="quality-slider"
        className="quality-range"
        type="range"
        min={1}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {disabled && <p className="control-note">PNG is lossless.</p>}
    </div>
  )
}

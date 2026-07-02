type Props = {
  value: number
  disabled: boolean
  onChange: (quality: number) => void
}

export function QualitySlider({ value, disabled, onChange }: Props) {
  return (
    <div className="control-block">
      <label className="control-label" htmlFor="quality-slider">
        Quality
        <output className="quality-value" htmlFor="quality-slider">
          {disabled ? '—' : value}
        </output>
      </label>
      <input
        id="quality-slider"
        type="range"
        min={1}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p className="control-note">
        {disabled
          ? 'PNG is lossless, so quality does not apply.'
          : 'Lower quality produces smaller files.'}
      </p>
    </div>
  )
}

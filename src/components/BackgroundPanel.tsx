type Props = {
  value: string
  // JPEG has no alpha channel, so transparent pixels are flattened onto this
  // color. Only worth flagging when a queued file actually has transparency.
  transparencyRisk: boolean
  onChange: (color: string) => void
}

export function BackgroundPanel({ value, transparencyRisk, onChange }: Props) {
  return (
    <div className="settings-section">
      <span className="control-label">Background</span>
      <label className="background-row">
        Fill for transparency
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {transparencyRisk && (
        <p className="metadata-warning">
          Transparent areas in the queue are filled with this color. JPG has no transparency.
        </p>
      )}
    </div>
  )
}

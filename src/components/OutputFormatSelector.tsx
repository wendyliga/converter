import type { OutputFormat } from '../types/image'

const CHOICES: { value: OutputFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
]

type Props = {
  value: OutputFormat
  webpSupported: boolean
  onChange: (format: OutputFormat) => void
}

export function OutputFormatSelector({ value, webpSupported, onChange }: Props) {
  return (
    <div className="settings-section">
      <span className="control-label" id="output-format-label">
        Output format
      </span>
      <div className="segmented" role="group" aria-labelledby="output-format-label">
        {CHOICES.map((choice) => {
          const disabled = choice.value === 'webp' && !webpSupported
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={value === choice.value}
              disabled={disabled}
              title={disabled ? 'This browser cannot encode WebP.' : undefined}
              onClick={() => onChange(choice.value)}
            >
              {choice.label}
            </button>
          )
        })}
      </div>
      {!webpSupported && (
        <p className="control-note">WebP export is not supported by this browser.</p>
      )}
    </div>
  )
}

import type { ImageFileItem, OutputFormat } from '../types/image'
import { FileCard } from './FileCard'

type Props = {
  items: ImageFileItem[]
  outputFormat: OutputFormat
  onRemove: (id: string) => void
}

export function FileQueue({ items, outputFormat, onRemove }: Props) {
  if (items.length === 0) return null
  return (
    <ul className="file-queue" aria-label="File queue" aria-live="polite">
      {items.map((item) => (
        <FileCard
          key={item.id}
          item={item}
          outputFormat={outputFormat}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}

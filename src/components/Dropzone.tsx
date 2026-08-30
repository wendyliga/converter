import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { FILE_INPUT_ACCEPT, FORMAT_LABELS, SUPPORTED_INPUTS } from '../core/detectFileType'
import { MAX_BATCH_COUNT, MAX_FILE_BYTES } from '../core/limits'

const FORMAT_LINE = SUPPORTED_INPUTS.map((format) => FORMAT_LABELS[format].toLowerCase()).join(' ')
const LIMIT_LINE = `${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB/file · ${MAX_BATCH_COUNT} files`

type DropzoneProps = { onFiles: (files: File[]) => void }

export function Dropzone({ onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const openPicker = () => inputRef.current?.click()

  const acceptFiles = (list: FileList | null) => {
    if (list && list.length > 0) onFiles(Array.from(list))
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    acceptFiles(event.dataTransfer.files)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  // The button is the keyboard-reachable control, so the surrounding area only
  // adds a mouse convenience — nesting two focusable controls would be worse.
  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    openPicker()
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        accept={FILE_INPUT_ACCEPT}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => acceptFiles(event.target.files)}
      />
      <div
        className={`dropzone${isDragging ? ' is-dragging' : ''}`}
        role="group"
        aria-label="Add images by dropping them here or choosing files"
        onClick={openPicker}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone-copy">
          <p className="dropzone-title">Drop images, or</p>
          <p className="dropzone-spec">
            {FORMAT_LINE} · {LIMIT_LINE}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary dropzone-button"
          onClick={handleButtonClick}
        >
          Choose files
        </button>
      </div>
    </>
  )
}

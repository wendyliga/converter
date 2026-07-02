import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { FILE_INPUT_ACCEPT } from '../core/detectFileType'

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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPicker()
    }
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
        role="button"
        tabIndex={0}
        aria-label="Add images: drop files here or press Enter to browse"
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="dropzone-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 20h16" />
          </svg>
        </span>
        <p className="dropzone-title">Drop images here or choose files</p>
        <p className="dropzone-hint">
          PNG · JPG · WebP · AVIF · HEIC · TIFF · SVG · BMP · ICO — up to 50 MB each
        </p>
      </div>
    </>
  )
}

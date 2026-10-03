"use client"

import { useId, useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { cn } from "cn"

export interface FileDropzoneProps {
  id?: string
  onFilesSelect: (files: File[]) => void
  accept: string
  /** Caption text only: the real type and size rules are enforced by the caller and the server. */
  caption: string
  /** Label for the control, read by screen readers. */
  label?: string
  className?: string
}

// The several-files sibling of ImageDropzone (AJ, 2026-10-03): the same dashed box, cloud icon and
// "drag and drop or click" wording, for receipts and other documents. Presentational only; it reports
// the dropped or picked files and the caller validates and uploads them.
export function FileDropzone({ id, onFilesSelect, accept, caption, label = "Click to upload files, or drag and drop", className }: FileDropzoneProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDraggingOver(true)
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDraggingOver(false)
        const files = Array.from(event.dataTransfer.files ?? [])
        if (files.length > 0) onFilesSelect(files)
      }}
      data-slot="file-dropzone"
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-input p-5 text-center transition-colors outline-none hover:border-primary/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        isDraggingOver && "border-primary bg-muted/50",
        className,
      )}
    >
      <UploadCloud className="size-8 text-muted-foreground" />
      <span className="text-sm font-medium">Click to upload files</span>
      <span className="text-xs text-muted-foreground">or drag and drop</span>
      <span className="text-xs text-muted-foreground">{caption}</span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          onFilesSelect(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
    </div>
  )
}

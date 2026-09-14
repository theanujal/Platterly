"use client"

import { useEffect, useId, useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { cn } from "cn"

export interface ImageDropzoneProps {
  id?: string
  /** Existing/uploaded image URL, if any. Ignored once a new file is picked (the new file's own preview takes over). */
  value: string | null
  onFileSelect: (file: File | null) => void
  accept?: string
  /** Caption text only — real size/type limits are enforced wherever each call site already does it, not here. */
  maxSizeMB?: number
  error?: string | null
  className?: string
}

// Shared drag-and-drop-or-click image upload control (AJ, 2026-09-14),
// replacing every bare <input type="file"> across the platform. Purely
// presentational: it never validates or uploads anything itself, only
// reports the picked File back to the caller, which keeps its own existing
// validation/server-action call unchanged. Its one real behavior change
// over what it replaces: every prior call site only ever re-showed the
// *old* image after picking a new file — this one previews the new file
// immediately via a local object URL.
export function ImageDropzone({
  id,
  value,
  onFileSelect,
  accept = "image/png,image/jpeg",
  maxSizeMB = 2,
  error,
  className,
}: ImageDropzoneProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFile(file: File | null) {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    onFileSelect(file)
  }

  const displayUrl = previewUrl ?? value

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={displayUrl ? "Change image" : "Click to upload image, or drag and drop"}
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
          const file = event.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
        data-slot="image-dropzone"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-input p-6 text-center transition-colors outline-none hover:border-primary/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          isDraggingOver && "border-primary bg-muted/50",
          error && "border-destructive",
        )}
      >
        {displayUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="" className="size-20 rounded-lg border border-border object-cover" />
            <span className="text-xs font-medium text-primary">Click to change image</span>
          </>
        ) : (
          <>
            <UploadCloud className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">Click to upload image</span>
            <span className="text-xs text-muted-foreground">or drag and drop</span>
            <span className="text-xs text-muted-foreground">PNG or JPG, up to {maxSizeMB}MB</span>
          </>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

/**
 * The platform's "are you sure?" popup for anything that deletes or cannot be undone (AJ, 2026-10-14). The caller keeps
 * the state of what is being confirmed (`open` is true while something is waiting), and `onConfirm` does the work. The
 * popup stays open until the work finishes, so a double click cannot run it twice.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void | Promise<void>
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={(event) => {
              event.preventDefault()
              void onConfirm()
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The unsaved-edit guard for a form in a popup (the drawers have it built in, see FormDrawer): `requestClose` closes at
 * once when nothing was edited and otherwise asks "Discard your changes?" first. Render `dialog` anywhere in the form.
 */
export function useDiscardGuard(dirty: boolean, close: () => void) {
  const [asking, setAsking] = useState(false)
  const dialog = (
    <ConfirmDialog
      open={asking}
      onOpenChange={setAsking}
      title="Discard your changes?"
      description="What you typed has not been saved and will be lost."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      onConfirm={() => {
        setAsking(false)
        close()
      }}
    />
  )
  return { requestClose: () => (dirty ? setAsking(true) : close()), dialog }
}

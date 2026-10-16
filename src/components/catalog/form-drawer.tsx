"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { CATALOG_ADD_TILE_CLASSNAME, CatalogAddTileContent } from "@/components/catalog/catalog-browser";
import { cn } from "cn";

// One drawer for every Add / Edit form (AJ, 2026-09-30): it replaces the mix of
// popups and pages the Menu Catalog and Customers used. The body scrolls, and the
// footer stays put with the Active switch bottom-left and Cancel / Save bottom-right.

const SIZE_CLASSNAME = {
  md: "data-[side=right]:sm:max-w-xl",
  lg: "data-[side=right]:sm:max-w-3xl",
  xl: "data-[side=right]:sm:max-w-5xl",
} as const;

export type DrawerSize = keyof typeof SIZE_CLASSNAME;

// Unsaved-edit guard (AJ, 2026-10-14): Esc, a click on the dimmed area, the X and Cancel used to close a drawer and throw
// away everything typed. A form inside the drawer reports whether it differs from how it started (`dirty` on DrawerForm);
// while it does, every way of closing asks "Discard your changes?" first. Saving closes the drawer directly, with no question.
interface DrawerGuard {
  setDirty: (dirty: boolean) => void;
  /** Runs `action` at once when nothing was edited, otherwise only after the person confirms the discard. */
  confirmDiscard: (action: () => void) => void;
}
const DrawerGuardContext = createContext<DrawerGuard | null>(null);

/**
 * True once `state` no longer matches what it was on the first render, so a form passes its values (and anything else the
 * person can change, such as a chosen file's name) and gets the `dirty` flag for DrawerForm.
 */
export function useIsDirty(state: unknown): boolean {
  const [first] = useState(() => JSON.stringify(state));
  return JSON.stringify(state) !== first;
}

export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: DrawerSize;
  children: React.ReactNode;
}) {
  // A ref, set in a layout effect, so the answer is already there when Esc is pressed right after typing (a state set in a
  // passive effect can lag behind a key press that Base UI handles outside React).
  const dirty = useRef(false);
  const [asking, setAsking] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  // Stable for the drawer's whole life, so DrawerForm's layout effect only runs when its own `dirty` changes.
  const [guard] = useState<DrawerGuard>(() => ({
    setDirty: (next) => {
      dirty.current = next;
    },
    confirmDiscard: (action) => {
      if (!dirty.current) {
        action();
        return;
      }
      pendingAction.current = action;
      setAsking(true);
    },
  }));

  return (
    <DrawerGuardContext.Provider value={guard}>
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(next) : guard.confirmDiscard(() => onOpenChange(false)))}>
      <SheetContent className={cn("w-full gap-0 p-0 data-[side=right]:w-full", SIZE_CLASSNAME[size])}>
        <SheetHeader className="border-b border-border p-5 pr-14">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>What you typed has not been saved and will be lost.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              const action = pendingAction.current;
              pendingAction.current = null;
              setAsking(false);
              action?.();
            }}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </DrawerGuardContext.Provider>
  );
}

/**
 * The form inside a FormDrawer: scrolling body, error line, and the footer.
 * `active` puts the platform's status switch bottom-left, label first and the switch after it. The label
 * changes with the state, in plain words for the caterer (say what "inactive" does); omit it for a form with no status.
 */
export function DrawerForm({
  onSubmit,
  error,
  pending,
  submitLabel,
  onCancel,
  active,
  startSlot,
  className,
  dirty = false,
  children,
}: {
  onSubmit: (event: React.FormEvent) => void;
  error: string | null;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  active?: { id: string; checked: boolean; onChange: (checked: boolean) => void; onLabel?: string; offLabel?: string };
  /** Extra control for the bottom-left of the footer, after the status switch (for example a Remove button). */
  startSlot?: React.ReactNode;
  /** Layout classes for the scrolling body (the default stacks fields with a gap). */
  className?: string;
  /** The form differs from how it started (see `useIsDirty`); closing the drawer then asks before discarding. */
  dirty?: boolean;
  children: React.ReactNode;
}) {
  const guard = useContext(DrawerGuardContext);
  const setGuardDirty = guard?.setDirty;
  useLayoutEffect(() => {
    setGuardDirty?.(dirty);
    return () => setGuardDirty?.(false);
  }, [dirty, setGuardDirty]);

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex flex-1 flex-col gap-5 overflow-y-auto p-5", className)}>{children}</div>
      {error && (
        <p role="alert" className="px-5 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border p-4 sm:px-5">
        <div className="flex items-center gap-4">
          {active && (
            <div className="flex items-center gap-3">
              <Label htmlFor={active.id} className="cursor-pointer">
                {active.checked ? (active.onLabel ?? "Active") : (active.offLabel ?? "Inactive")}
              </Label>
              <Switch id={active.id} checked={active.checked} onCheckedChange={active.onChange} />
            </div>
          )}
          {startSlot}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => (guard ? guard.confirmDiscard(onCancel) : onCancel())}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The Add trigger (top-right button or the dashed grid tile) and the drawer it opens.
 * `children` receives a `close` callback for the form's onCancel / onSuccess.
 */
export function AddDrawer({
  variant = "button",
  buttonLabel,
  tileLabel,
  tileDescription,
  title,
  description,
  size,
  children,
}: {
  variant?: "button" | "tile";
  buttonLabel: string;
  tileLabel: string;
  tileDescription: string;
  title: string;
  description?: string;
  size?: DrawerSize;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "tile" ? (
        <button type="button" className={CATALOG_ADD_TILE_CLASSNAME} onClick={() => setOpen(true)}>
          <CatalogAddTileContent label={tileLabel} description={tileDescription} />
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {buttonLabel}
        </Button>
      )}
      <FormDrawer open={open} onOpenChange={setOpen} title={title} description={description} size={size}>
        {children(() => setOpen(false))}
      </FormDrawer>
    </>
  );
}

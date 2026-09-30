"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn("w-full gap-0 p-0 data-[side=right]:w-full", SIZE_CLASSNAME[size])}>
        <SheetHeader className="border-b border-border p-5 pr-14">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
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
  className,
  children,
}: {
  onSubmit: (event: React.FormEvent) => void;
  error: string | null;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  active?: { id: string; checked: boolean; onChange: (checked: boolean) => void; onLabel?: string; offLabel?: string };
  /** Layout classes for the scrolling body (the default stacks fields with a gap). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex flex-1 flex-col gap-5 overflow-y-auto p-5", className)}>{children}</div>
      {error && (
        <p role="alert" className="px-5 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border p-4 sm:px-5">
        {active ? (
          <div className="flex items-center gap-3">
            <Label htmlFor={active.id} className="cursor-pointer">
              {active.checked ? (active.onLabel ?? "Active") : (active.offLabel ?? "Inactive")}
            </Label>
            <Switch id={active.id} checked={active.checked} onCheckedChange={active.onChange} />
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
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

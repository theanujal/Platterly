"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, MoreVertical, Pencil, Trash2, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Result = { ok: true } | { ok: false; error: string };

interface CatalogCardMenuProps {
  /** The record's own name, for aria-labels and the delete prompt. */
  name: string;
  /** "Menu Type", "Food Item"… — used in "Edit Menu Type". */
  entityLabel: string;
  /** Only needed alongside `onSetActive`. */
  isActive?: boolean;
  /** Extra entity-specific actions (e.g. Inventory's Stock In / Out), listed after Edit. `ariaLabel` names the icon in list rows. */
  extraActions?: { label: string; ariaLabel: string; icon: LucideIcon; onClick: () => void }[];
  /** "overlay": ⋮ menu on the card image. "plain": list-row icons — Edit, Duplicate, Delete. */
  variant?: "overlay" | "plain";
  /** Opens the entity's edit dialog, or (for page-based edit) links to its edit page. */
  onEdit?: () => void;
  editHref?: string;
  /** Omit an action an entity doesn't have (Inventory has no Active state). */
  onDuplicate?: () => Promise<Result>;
  onSetActive?: (active: boolean) => Promise<Result>;
  onDelete: () => Promise<Result>;
  deleteDescription: string;
}

/**
 * The 3-dot menu on every Menu Catalog card and row (AJ, 2026-09-30): Edit,
 * Duplicate, Activate / Deactivate, Delete. The delete confirmation and the
 * error notice are rendered beside the menu, not inside it — a dialog owned
 * by a menu item unmounts the moment the menu closes.
 */
export function CatalogCardMenu({
  name,
  entityLabel,
  isActive = true,
  extraActions = [],
  variant = "overlay",
  onEdit,
  editHref,
  onDuplicate,
  onSetActive,
  onDelete,
  deleteDescription,
}: CatalogCardMenuProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<Result>) {
    const result = await action();
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setPending(true);
    setDeleteError(null);
    const result = await onDelete();
    setPending(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setConfirmOpen(false);
    router.refresh();
  }

  const trigger =
    variant === "plain" ? (
      <div className="flex items-center gap-0.5">
        {extraActions.map((action) => (
          <Button key={action.label} type="button" variant="ghost" size="icon-sm" aria-label={action.ariaLabel} onClick={action.onClick}>
            <action.icon className="size-4" />
          </Button>
        ))}
        {editHref ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} render={<Link href={editHref} />} nativeButton={false}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
        )}
        {onDuplicate && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicate ${name}`} onClick={() => void run(onDuplicate)}>
            <Copy className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${name}`}
          onClick={() => {
            setDeleteError(null);
            setConfirmOpen(true);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              className="size-10 border-transparent bg-background text-foreground shadow-sm hover:bg-background/90"
              aria-label={`Actions for ${name}`}
            />
          }
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-48">
          {editHref ? (
            <DropdownMenuLinkItem render={<Link href={editHref} />}>
              <Pencil />
              Edit {entityLabel}
            </DropdownMenuLinkItem>
          ) : (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              Edit {entityLabel}
            </DropdownMenuItem>
          )}
          {extraActions.map((action) => (
            <DropdownMenuItem key={action.label} onClick={action.onClick}>
              <action.icon />
              {action.label}
            </DropdownMenuItem>
          ))}
          {onDuplicate && (
            <DropdownMenuItem onClick={() => void run(onDuplicate)}>
              <Copy />
              Duplicate
            </DropdownMenuItem>
          )}
          {onSetActive && (
            <DropdownMenuItem onClick={() => void run(() => onSetActive(!isActive))}>
              {isActive ? <EyeOff /> : <Eye />}
              {isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          )}
          <div role="separator" className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setDeleteError(null);
              setConfirmOpen(true);
            }}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <>
      {trigger}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={notice !== null} onOpenChange={(open) => !open && setNotice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>That didn&apos;t work</AlertDialogTitle>
            <AlertDialogDescription>{notice}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNotice(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

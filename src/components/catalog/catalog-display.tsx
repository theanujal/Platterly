import { ImageOff, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

// Shared pieces of the Menu Catalog cards and rich lists (Event Types, Menu Types,
// Menu Categories, Food Items, Add-ons), so the five pages read as one system
// (AJ, 2026-09-30): an image (or icon tile) on top, a title row that carries the
// inactive badge and the row actions, a description, tags, and a footer rule with
// the price or status. Server-safe: no hooks.

/**
 * As many 15rem-minimum columns as fit, but never more than four (AJ, 2026-09-30):
 * the minimum is the larger of 15rem and a quarter of the row, so a wide screen
 * gets exactly four cards across and a narrower one drops to three, two or one.
 */
export const CATALOG_GRID_CLASSNAME = "[grid-template-columns:repeat(auto-fill,minmax(max(15rem,calc((100%_-_3rem)/4)),1fr))]";

/** Card top: the uploaded image, or the entity's own icon on a muted tile. */
export function CatalogCardMedia({ src, icon: Icon = ImageOff }: { src: string | null; icon?: LucideIcon }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- catalog uploads are plain /uploads files, same as the rest of the app
    <img src={src} alt="" className="aspect-video w-full object-cover" />
  ) : (
    <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
      <Icon className="size-7" />
    </div>
  );
}

/** Whole card body: title row, description, tags, and an optional footer pinned to the bottom so cards in a row line up. */
export function CatalogCardBody({
  title,
  titleIcon: TitleIcon,
  trailing,
  description,
  tags,
  footer,
}: {
  title: string;
  titleIcon?: LucideIcon;
  /** Inactive badge and the row's action buttons. */
  trailing?: React.ReactNode;
  description?: string | null;
  tags?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-base leading-snug font-semibold">
          {TitleIcon && <TitleIcon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </span>
        {trailing && <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1">{trailing}</div>}
      </div>
      {description && <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>}
      {tags && <div className="flex flex-wrap items-center gap-1.5">{tags}</div>}
      {footer && <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">{footer}</div>}
    </div>
  );
}

/** 44px rounded thumbnail (or icon tile) that leads a list row's first cell. */
export function CatalogListThumb({ src, icon: Icon = ImageOff, className }: { src: string | null; icon?: LucideIcon; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- catalog uploads are plain /uploads files, same as the rest of the app
    <img src={src} alt="" className={cn("size-11 shrink-0 rounded-lg object-cover", className)} />
  ) : (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", className)}>
      <Icon className="size-5" />
    </span>
  );
}

/** First list cell: thumbnail, name, and a one-line description under it. */
export function CatalogNameCell({ name, description, src, icon }: { name: string; description?: string | null; src: string | null; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-3">
      <CatalogListThumb src={src} icon={icon} />
      <div className="flex min-w-0 flex-col">
        <span className="max-w-56 truncate font-semibold">{name}</span>
        {description && <span className="max-w-56 truncate text-xs text-muted-foreground">{description}</span>}
      </div>
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

/** Veg / Non-Veg, the same green / red tags the food item drawer uses. */
export function FoodTypeTag({ nonVeg }: { nonVeg: boolean }) {
  return nonVeg ? <Badge variant="danger">Non-Veg</Badge> : <Badge variant="success">Veg</Badge>;
}

export function formatRupees(amount: number): string {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

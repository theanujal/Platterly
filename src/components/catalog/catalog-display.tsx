import Link from "next/link";
import { Drumstick, ImageOff, Leaf, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

// Shared pieces of the Menu Catalog cards and rich lists (Event Types, Menu Types,
// Menu Categories, Food Items, Add-ons), so the five pages read as one system
// (AJ, 2026-09-30): an image (or icon tile) on top with a diet / type tag and the
// 3-dot actions menu floating over its top-right corner, then the title, a
// description, optional tags, and a footer rule with the price or count on the
// left and the Active / Inactive status on the right. Server-safe: no hooks.

/**
 * As many 15rem-minimum columns as fit, but never more than four (AJ, 2026-09-30):
 * the minimum is the larger of 15rem and a quarter of the row, so a wide screen
 * gets exactly four cards across and a narrower one drops to three, two or one.
 */
export const CATALOG_GRID_CLASSNAME = "[grid-template-columns:repeat(auto-fill,minmax(max(15rem,calc((100%_-_3rem)/4)),1fr))]";

/** Card top: the uploaded image, or the entity's own icon on a muted tile. `overlay` floats over its top-right corner. */
export function CatalogCardMedia({ src, icon: Icon = ImageOff, overlay }: { src: string | null; icon?: LucideIcon; overlay?: React.ReactNode }) {
  return (
    <div className="relative">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog uploads are plain /uploads files, same as the rest of the app
        <img src={src} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
          <Icon className="size-7" />
        </div>
      )}
      {overlay && <div className="absolute top-3 right-3 z-10 flex items-center gap-2">{overlay}</div>}
    </div>
  );
}

/** Whole card body: title, description, tags, and a footer pinned to the bottom so cards in a row line up. */
export function CatalogCardBody({
  title,
  titleIcon: TitleIcon,
  titleHref,
  description,
  tags,
  footer,
  active,
  statusBadge,
}: {
  title: string;
  titleIcon?: LucideIcon;
  /** Makes the title a link stretched over the whole card (the card's container must be `relative`); the overlay menu stays clickable above it. */
  titleHref?: string;
  description?: string | null;
  tags?: React.ReactNode;
  /** Left side of the footer rule: price, guest minimum, or an assignment count. */
  footer?: React.ReactNode;
  /** Right side of the footer rule: the Active / Inactive status. */
  active?: boolean;
  /** Right side of the footer rule for a status that isn't Active / Inactive (e.g. In Stock). Wins over `active`. */
  statusBadge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <span className="flex min-w-0 items-center gap-2 text-base leading-snug font-semibold">
        {TitleIcon && <TitleIcon className="size-4 shrink-0 text-muted-foreground" />}
        {titleHref ? (
          <Link href={titleHref} className="truncate outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
            {title}
          </Link>
        ) : (
          <span className="truncate">{title}</span>
        )}
      </span>
      {description && <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>}
      {tags && <div className="flex flex-wrap items-center gap-1.5">{tags}</div>}
      {(footer || active !== undefined || statusBadge) && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex min-w-0 items-baseline gap-2">{footer}</div>
          {statusBadge ?? (active !== undefined && <ActiveBadge active={active} />)}
        </div>
      )}
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
  return (
    <Badge variant={active ? "success" : "neutral"}>
      <span className="size-1.5 rounded-full bg-current" />
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

/** Veg / Non-Veg, the same green / red tags the food item drawer uses. */
export function FoodTypeTag({ nonVeg, onImage = false }: { nonVeg: boolean; onImage?: boolean }) {
  const Icon = nonVeg ? Drumstick : Leaf;
  // On a photo the tinted badge would wash out, so it sits on a solid pill instead.
  return (
    <Badge variant={nonVeg ? "danger" : "success"} className={cn(onImage && "h-10 bg-background px-3.5 text-sm shadow-sm", onImage && (nonVeg ? "text-destructive" : "text-success"))}>
      {onImage && <Icon className="size-4!" />}
      {nonVeg ? "Non-Veg" : "Veg"}
    </Badge>
  );
}

export function formatRupees(amount: number): string {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

import { Check, CircleCheck, ClipboardCheck, Hourglass, Layers, Receipt, Send, X } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { badgeVariants } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type Tone } from "@/modules/orders/order-status";
import type { OrderStatus, OrderKind } from "@/generated/prisma/enums";

// Shared by the Orders page's list rows and its cards (order-card.tsx).

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Order status labels/tones live in modules/orders/order-status.ts (shared
// with the workflow that sets them); only the icons are display-only.
// Tinted fill + full-strength text per tone (the recipe Badge uses), for the
// larger surfaces that aren't badges: the card's callout.
export const TONE_SURFACE: Record<Tone, string> = {
  neutral: "bg-muted text-foreground",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
  violet: "bg-tone-violet/10 text-tone-violet",
  cyan: "bg-tone-cyan/10 text-tone-cyan",
  pink: "bg-tone-pink/10 text-tone-pink",
  fuchsia: "bg-tone-fuchsia/10 text-tone-fuchsia",
  teal: "bg-tone-teal/10 text-tone-teal",
  yellow: "bg-tone-yellow/10 text-tone-yellow",
  orange: "bg-tone-orange/10 text-tone-orange",
};

// Plain colored text (no fill) for a tone — the list's payment status under the amount.
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
  danger: "text-destructive",
  violet: "text-tone-violet",
  cyan: "text-tone-cyan",
  pink: "text-tone-pink",
  fuchsia: "text-tone-fuchsia",
  teal: "text-tone-teal",
  yellow: "text-tone-yellow",
  orange: "text-tone-orange",
};

export const STATUS_LABEL = ORDER_STATUS_LABEL;
export const STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = ORDER_STATUS_TONE;

export const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  PENDING_REVIEW: ClipboardCheck,
  AWAITING_CUSTOMER_APPROVAL: Hourglass,
  APPROVED: Check,
  SENT_TO_KITCHEN: Send,
  COMPLETED: CircleCheck,
  CANCELLED: X,
};

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  SINGLE: "Single Order",
  MULTI: "Multi Order",
};

// Legend for Single vs. Multi Order (AJ, 2026-09-19) — both used to render
// the same "secondary" gray badge with no way to tell them apart at a glance.
export const ORDER_KIND_VARIANT: Record<OrderKind, BadgeVariant> = {
  SINGLE: "neutral",
  MULTI: "info",
};

export const ORDER_KIND_ICON: Record<OrderKind, LucideIcon> = {
  SINGLE: Receipt,
  MULTI: Layers,
};

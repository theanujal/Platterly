import { Circle, Send, Eye, TriangleAlert, Check, X, CalendarX, type LucideIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { QuotationStatus } from "@/generated/prisma/enums";

// Shared by the Quotations page's list rows and its cards, same split as Orders' own order-display.ts.

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Shared neutral/info/warning/success/danger legend (AJ, 2026-09-19).
export const STATUS_VARIANT: Record<QuotationStatus, BadgeVariant> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "info",
  CHANGES_REQUESTED: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export const STATUS_ICON: Record<QuotationStatus, LucideIcon> = {
  DRAFT: Circle,
  SENT: Send,
  VIEWED: Eye,
  CHANGES_REQUESTED: TriangleAlert,
  ACCEPTED: Check,
  REJECTED: X,
  EXPIRED: CalendarX,
};

export const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  CHANGES_REQUESTED: "Changes Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

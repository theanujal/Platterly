import type { KitchenProductionStatus } from "@/generated/prisma/enums";

// Split out from menu-approval.ts (AJ, 2026-09-19): menu-approval.ts is
// `server-only` (imports prisma/pg), and the Kitchen Dashboard's per-card
// stage dropdown is a Client Component — importing a constant straight from
// menu-approval.ts pulled the whole server module (and `pg`) into the
// client bundle, breaking the build. This file has zero server dependency,
// safe for both sides.
export const KITCHEN_PRODUCTION_STATUS_LABEL: Record<KitchenProductionStatus, string> = {
  PENDING: "Pending",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const KITCHEN_PRODUCTION_BOARD_STAGES = ["PENDING", "IN_PREPARATION", "READY"] as const satisfies readonly KitchenProductionStatus[];

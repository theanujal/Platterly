import type { StandFulfilment } from "@platterly/contract";

export const FULFILMENT_LABEL: Record<StandFulfilment, string> = { PLACED: "Placed", PRINTING: "Printing", SHIPPED: "Shipped", DELIVERED: "Delivered" };
export const FULFILMENT_TONE: Record<StandFulfilment, "info" | "warning" | "success" | "neutral"> = { PLACED: "info", PRINTING: "warning", SHIPPED: "info", DELIVERED: "success" };
/** The button that moves an order out of this step. */
export const NEXT_STEP_LABEL: Record<StandFulfilment, string | null> = { PLACED: "Start printing", PRINTING: "Mark as shipped", SHIPPED: "Mark as delivered", DELIVERED: null };

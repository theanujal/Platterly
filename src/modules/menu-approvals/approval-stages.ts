import type { MenuSelectionStatus } from "@/generated/prisma/enums";

// Shared by menu-approval.ts and orders/order.ts. A separate file with no imports of either, because menu-approval.ts already
// imports order.ts and order.ts needs these two names for the price freeze.

export class InvalidMenuSelectionTransitionError extends Error {}

/**
 * The team may only edit a menu's items, or anything that sets what the customer pays, while no version of it is in front of
 * the customer or locked for the kitchen — otherwise the customer would approve a snapshot that no longer matches what the
 * kitchen then cooks. (To change a sent or approved menu, recall it to DRAFT first.)
 */
export const EDITABLE_STATUSES: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

/** Every stage in which the price is the customer's or the kitchen's, so it can't change without a recall and a new approval. */
export function isPriceFrozenStatus(status: MenuSelectionStatus): boolean {
  return !EDITABLE_STATUSES.includes(status);
}

export const PRICE_FROZEN_MESSAGE =
  "The price can't change while the menu is with the customer, approved or with the kitchen. Recall the menu to edit it; the customer will approve the new version.";

export const MEAL_PLAN_FROZEN_MESSAGE = "This menu is with the customer or the kitchen. Recall it before changing it.";

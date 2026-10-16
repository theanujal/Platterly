"use client";

import { createContext, useContext } from "react";

/**
 * The order page's Save buttons (top right, bottom right) also save the Menu Approval tab's meal plan while that tab is open (AJ, 2026-10-16):
 * the tab publishes its save here, the order form shows the buttons and calls it. Without a provider (the approve-only view has no order form
 * around the review) the review keeps its own Save Changes button.
 */
export interface ApprovalSaveState {
  /** Resolves once the save has finished, so a caller saving more than one thing can do them one after the other. */
  save: () => void | Promise<void>;
  dirty: boolean;
  saving: boolean;
}

const PublishContext = createContext<((state: ApprovalSaveState | null) => void) | null>(null);

export const ApprovalSavePublisherProvider = PublishContext.Provider;

export function useApprovalSavePublisher() {
  return useContext(PublishContext);
}

/**
 * True while the order form around the review has edits that are not saved yet (a changed guest count, a price, the venue...). Sending the
 * menu to the customer uses what is saved, so sending then would silently leave those edits out (AJ, 2026-10-16): the tab refuses to send
 * until they are saved. False without an order form around the review.
 */
const UnsavedOrderEditsContext = createContext(false);

export const UnsavedOrderEditsProvider = UnsavedOrderEditsContext.Provider;

export function useUnsavedOrderEdits() {
  return useContext(UnsavedOrderEditsContext);
}

export const UNSAVED_ORDER_EDITS_MESSAGE = "You have unsaved changes on this order. Save them first so the customer sees them, then send the menu.";

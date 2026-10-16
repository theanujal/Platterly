"use client";

import { createContext, useContext } from "react";

/**
 * The order page's Save buttons (top right, bottom right) also save the Menu Approval tab's meal plan while that tab is open (AJ, 2026-10-16):
 * the tab publishes its save here, the order form shows the buttons and calls it. Without a provider (the approve-only view has no order form
 * around the review) the review keeps its own Save Changes button.
 */
export interface ApprovalSaveState {
  save: () => void;
  dirty: boolean;
  saving: boolean;
}

const PublishContext = createContext<((state: ApprovalSaveState | null) => void) | null>(null);

export const ApprovalSavePublisherProvider = PublishContext.Provider;

export function useApprovalSavePublisher() {
  return useContext(PublishContext);
}

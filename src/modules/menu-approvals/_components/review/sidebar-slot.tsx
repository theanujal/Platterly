"use client";

import { createContext, useContext, useState } from "react";

/**
 * The page's right-hand column can hold the Menu Approval cards (Menu Status, Notes, Menu History, Pricing Details): the page provides an
 * empty element, the review draws the cards into it. Held in state through a ref callback, so the cards appear as soon as the element exists,
 * on a first load and on a client-side visit alike.
 */
const SlotContext = createContext<HTMLElement | null>(null);

export const ApprovalSidebarSlotProvider = SlotContext.Provider;

export function useApprovalSidebarSlot() {
  return useContext(SlotContext);
}

/** For a page with no order form around the review (the approve-only view): the review on the left and the slot in a right-hand column. */
export function ApprovalSidebarLayout({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <ApprovalSidebarSlotProvider value={slot}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6" data-testid="order-approval-tab">
          {children}
        </div>
        <div ref={setSlot} id="order-approval-sidebar" className="flex min-w-0 flex-col gap-4" />
      </div>
    </ApprovalSidebarSlotProvider>
  );
}

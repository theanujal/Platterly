"use client";

import { createContext, useContext } from "react";

/**
 * The order form's live Grand Total, so the Payment summary beside the pricing editor follows what is typed before Save (AJ, 2026-10-16).
 * Null outside the order form: the summary then shows the saved total.
 */
const LiveOrderTotal = createContext<number | null>(null);

export const LiveOrderTotalProvider = LiveOrderTotal.Provider;

export function useLiveOrderTotal() {
  return useContext(LiveOrderTotal);
}

/** One priced line of the order (label, optional detail such as "3 × ₹200", rupee amount). */
export interface OrderPriceLine {
  label: string;
  detail?: string;
  amount: number;
  /** A deduction, shown with a minus sign. */
  negative?: boolean;
}

/** The order form's priced lines, so the Payment summary can list them above the totals (AJ, 2026-10-16). Empty outside the form. */
const OrderPriceLines = createContext<OrderPriceLine[]>([]);

export const OrderPriceLinesProvider = OrderPriceLines.Provider;

export function useOrderPriceLines() {
  return useContext(OrderPriceLines);
}

"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Which kinds of sensitive data the signed-in person holds (Roles & Permissions redesign, AJ 2026-10-17). The app layout reads
 * them on the server and provides them here so client forms several dialogs deep can leave a price or cost field out. This is the
 * interface only: every action ignores a submitted figure without the right, and the pages never send one.
 */
export interface SensitiveFlags {
  menuPrices: boolean;
  orderPrices: boolean;
  paymentDetails: boolean;
  supplierCosts: boolean;
  recipeCosts: boolean;
  profitability: boolean;
  financialReports: boolean;
  commercialDocuments: boolean;
}

// The default (outside a provider, e.g. in a test render) shows everything: only the app layout restricts.
const ALL: SensitiveFlags = { menuPrices: true, orderPrices: true, paymentDetails: true, supplierCosts: true, recipeCosts: true, profitability: true, financialReports: true, commercialDocuments: true };

const SensitiveContext = createContext<SensitiveFlags>(ALL);

export function SensitiveAccessProvider({ flags, children }: { flags: SensitiveFlags; children: ReactNode }) {
  return <SensitiveContext.Provider value={flags}>{children}</SensitiveContext.Provider>;
}

export function useSensitive(): SensitiveFlags {
  return useContext(SensitiveContext);
}

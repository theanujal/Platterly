// The Account read-only API contract, shared by the server data layer and the screens. No server-only imports here.
export const CATALOGUE_KEYS = ["caterly", "rivo"] as const;
export type ProductKey = (typeof CATALOGUE_KEYS)[number];
/** Platform knows only whether a product is linked to the business and whether that link is suspended. Trials and invoices are Ops data. */
export type LinkState = "linked" | "suspended" | "none";

export type BusinessSummary = { id: string; name: string; status: "active" | "suspended"; role: "Admin" };

export type BusinessSection =
  /** The person has no business yet. */
  | { state: "none" }
  /** The person has a membership but holds no authority now (a former Admin whose row is disabled or removed). */
  | { state: "forbidden"; reason: "member_disabled" | "member_removed" }
  | { state: "ok"; business: BusinessSummary; products: Record<ProductKey, LinkState> };

export type AccountUserView = { id: string; email: string; emailVerified: boolean };
export type AccountOverview = { user: AccountUserView; business: BusinessSection };

export type OverviewResult = { status: "ok"; overview: AccountOverview } | { status: "unauthenticated" } | { status: "error" };

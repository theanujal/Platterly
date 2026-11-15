// The Account read-only API contract, shared by the server data layer and the screens. No server-only imports here.
import type { FeatureIcon } from "@platterly/contract";
export const CATALOGUE_KEYS = ["caterly", "rivo"] as const;
export type ProductKey = (typeof CATALOGUE_KEYS)[number];
/** Platform knows only whether a product is linked to the business and whether that link is suspended. Trials and invoices are Ops data. */
export type LinkState = "linked" | "suspended" | "none";

/** Read-only: a person Caterly lists in this business. Not a Platform member (no sign-in here, no permission). */
export type TeamMemberView = { id: string; name: string; email: string; role: string };

export type BusinessSummary = { id: string; name: string; status: "active" | "suspended"; role: "Admin" };

export type BusinessSection =
  /** The person has no business yet. */
  | { state: "none" }
  /** The person has a membership but holds no authority now (a former Admin whose row is disabled or removed). */
  | { state: "forbidden"; reason: "member_disabled" | "member_removed" }
  | { state: "ok"; business: BusinessSummary; products: Record<ProductKey, LinkState>; team: TeamMemberView[]; /** Where "Open" takes the person: the product's own dashboard, from the product registry. Only for a linked product whose registry entry is current. */ openUrls?: Partial<Record<ProductKey, string>> };

export type AccountUserView = { id: string; email: string; emailVerified: boolean; /** The person's full name, when the Account holds one; screens fall back to the email. */ name?: string };
export type AccountOverview = { user: AccountUserView; business: BusinessSection };

export type OverviewResult = { status: "ok"; overview: AccountOverview } | { status: "unauthenticated" } | { status: "error" };

/**
 * One card on My Products, from Ops (AJ, 2026-11-15). `accountKey` is the key the Account uses for the product (`caterly` for Ops's `catering`), which is how a card is
 * matched to the business's link state. `imageUrl` is a built-in picture or this app's own proxy of an uploaded one, never an address on another site.
 */
export type AccountProductCard = { key: string; accountKey: string; name: string; tagline: string | null; imageUrl: string | null; logoUrl: string | null; about: string | null; features: { icon: FeatureIcon; title: string; text: string }[]; status: "LIVE" | "UPCOMING"; launchAt: string | null };
export type AccountProductCardsResult = { status: "ok"; cards: AccountProductCard[] } | { status: "unavailable" } | { status: "unauthenticated" };

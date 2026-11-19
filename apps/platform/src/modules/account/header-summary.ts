import type { AccountOverview, AccountProductCard, ProductKey } from "./types";
import { CATALOGUE_KEYS } from "./types";

/**
 * What the marketing site's header needs to know about the person looking at it (AJ, 2026-11-19): who they are (a name and initials, and whether there is a
 * photo) and which products they can open. It is the smallest useful slice of the overview: no email, no business name, no team, no billing. Pure: the route reads the
 * data and passes it in, so the rules here are tested without a database.
 */
export type HeaderProduct = { key: ProductKey; name: string; openUrl: string };
export type HeaderSummary =
  | { status: "signed_out" }
  | { status: "signed_in"; name: string; initials: string; photoUrl: string | null; accountUrl: string; products: HeaderProduct[] };

const FALLBACK_NAMES: Record<ProductKey, string> = { caterly: "Caterly by Platterly", rivo: "Rivo" };

/** Up to two capital letters: the first letters of the first and last word of the name, or the first letter of the email when there is no name. */
export function initialsOf(name: string | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : words.length === 1 ? words[0][0] : email.trim()[0] ?? "?";
  return letters.toUpperCase();
}

export function buildHeaderSummary(input: { overview: AccountOverview | null; cards: AccountProductCard[]; photoUrl: string | null; accountUrl: string }): HeaderSummary {
  const { overview } = input;
  if (!overview) return { status: "signed_out" };
  const name = overview.user.name?.trim() || overview.user.email.split("@")[0];
  const products: HeaderProduct[] = [];
  if (overview.business.state === "ok") {
    for (const key of CATALOGUE_KEYS) {
      const url = overview.business.openUrls?.[key];
      // Only a product the business really has, whose registered address is current: nothing is guessed.
      if (overview.business.products[key] !== "linked" || !url) continue;
      products.push({ key, name: input.cards.find((c) => c.accountKey === key)?.name ?? FALLBACK_NAMES[key], openUrl: url });
    }
  }
  return { status: "signed_in", name, initials: initialsOf(overview.user.name, overview.user.email), photoUrl: input.photoUrl, accountUrl: input.accountUrl, products };
}

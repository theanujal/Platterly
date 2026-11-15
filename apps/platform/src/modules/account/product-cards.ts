import "server-only";
import { fetchOpsCardImage, fetchOpsProductCards } from "@/modules/store/ops-catalogue";
import { storeKeyFor } from "@platterly/contract";
import type { AccountProductCard, AccountProductCardsResult } from "./types";

/** The picture's address in the browser: a built-in file of this app, or this app's own route for an upload (never an outside address). */
export function cardImageUrl(ref: string | null): string | null {
  if (!ref) return null;
  if (ref.startsWith("builtin:")) return `/products/${ref.slice(8)}.svg`;
  if (ref.startsWith("upload:")) return `/api/account/product-image/${encodeURIComponent(ref.slice(7))}`;
  return null;
}

/** The cards for My Products and the Overview, from Ops. When Ops cannot be read the answer says so; the screens never show made-up products. */
export async function loadAccountProductCards(fetchCards: typeof fetchOpsProductCards = fetchOpsProductCards): Promise<AccountProductCardsResult> {
  const result = await fetchCards();
  if (!result.ok) return { status: "unavailable" };
  const cards: AccountProductCard[] = result.cards.products.map((p) => ({ key: p.key, accountKey: storeKeyFor(p.key), name: p.name, tagline: p.tagline, imageUrl: cardImageUrl(p.image), logoUrl: cardImageUrl(p.logo), about: p.about, features: p.features, status: p.status, launchAt: p.launchAt }));
  return { status: "ok", cards };
}

/** The Ops logo of one product (by its Account key, e.g. `caterly`), or null when Ops shows no logo for it or cannot be read. */
export async function loadProductLogo(accountKey: string, deps: { fetchCards?: typeof fetchOpsProductCards; fetchImage?: typeof fetchOpsCardImage } = {}) {
  const cards = await (deps.fetchCards ?? fetchOpsProductCards)();
  if (!cards.ok) return null;
  const ref = cards.cards.products.find((p) => storeKeyFor(p.key) === accountKey)?.logo;
  if (!ref?.startsWith("upload:")) return null;
  const image = await (deps.fetchImage ?? fetchOpsCardImage)(ref.slice(7));
  return image.ok ? { mime: image.mime, bytes: image.bytes } : null;
}

/** True when Ops currently shows a logo for this product (the sign-in page then uses the logo route). */
export async function loadProductLogoExists(accountKey: string): Promise<boolean> {
  return (await loadProductLogo(accountKey)) !== null;
}

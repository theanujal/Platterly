"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRODUCTS } from "@/lib/account/catalogue";
import type { AccountProductCard, AccountProductCardsResult, LinkState } from "@/modules/account/types";
import { Countdown } from "./countdown";
import { StatePanel } from "./data";
import { Icon } from "./icons";
import { Badge, type Tone } from "./ui";

export const LINK_TONE: Record<LinkState, Tone> = { linked: "success", suspended: "warning", none: "neutral" };
/** The status of a live product's card: "Available" on My Products, "Active" in the Overview's compact card. */
const STATUS_LABEL: Record<LinkState, string> = { linked: "Available", suspended: "Suspended", none: "Not set up" };
const COMPACT_LABEL: Record<LinkState, string> = { linked: "Active", suspended: "Suspended", none: "Not set up" };

export type CardsState = { phase: "loading" } | { phase: "ready"; cards: AccountProductCard[] } | { phase: "unavailable" };

/**
 * The product cards from Ops (AJ, 2026-11-15): which products exist, their lines, pictures and launch dates are Ops's; the business's link to each and the address
 * "Open" goes to come from the Account's own data. When Ops cannot be read, only the products the business is linked to are shown, by name, and a note says why.
 */
export function useProductCards(): { state: CardsState; retry: () => void } {
  const [state, setState] = useState<CardsState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch("/api/account/products", { cache: "no-store", credentials: "same-origin" });
        const body = (await res.json()) as AccountProductCardsResult;
        return res.ok && body.status === "ok" ? body.cards : null;
      } catch {
        return null;
      }
    };
    (async () => {
      setState({ phase: "loading" });
      // One quiet second try: Ops can be slow on its first answer after it starts.
      const cards = (await read()) ?? (await new Promise((r) => setTimeout(r, 1500)).then(read));
      if (alive) setState(cards ? { phase: "ready", cards } : { phase: "unavailable" });
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

/**
 * One product card, in AJ's sample: the tile and status on top, the name and one line, the picture beside them and the actions at the bottom left. A live product
 * has "Open" (to the product's own dashboard; disabled when it is not linked, suspended or has no registered address). An upcoming product says "Coming soon" with the
 * countdown to its launch date. The compact form is the Overview's: no picture.
 */
export function ProductCard({ card, link, openUrl, compact = false }: { card: AccountProductCard; link: LinkState; openUrl?: string; compact?: boolean }) {
  const upcoming = card.status === "UPCOMING";
  const selected = !upcoming && link === "linked";
  return (
    <article className={`pa-card pa-product${compact ? "" : " pa-product-tile"}${upcoming ? " pa-product-soon" : ""}${selected ? " is-selected" : ""}`} aria-label={card.name} data-selected={selected}>
      <div className="pa-product-top">
        {card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
          <img className="pa-product-mark pa-product-logo" src={card.logoUrl} alt="" width={44} height={44} />
        ) : (
          <span className={`pa-product-mark${upcoming ? " pa-product-mark-soon" : ""}`} aria-hidden="true">{card.name.charAt(0).toUpperCase()}</span>
        )}
        <div className="pa-product-id">
          <h3>{card.name}</h3>
          {card.tagline ? <p>{card.tagline}</p> : null}
        </div>
        {upcoming ? <Badge tone="neutral">Coming soon</Badge> : <Badge tone={LINK_TONE[link]}>{(compact ? COMPACT_LABEL : STATUS_LABEL)[link]}</Badge>}
      </div>
      {upcoming && card.launchAt ? <Countdown launchAt={card.launchAt} /> : null}
      {compact || !card.imageUrl ? null : <span className="pa-product-art" style={{ backgroundImage: `url(${card.imageUrl})` }} aria-hidden="true" />}
      <div className="pa-card-foot pa-card-foot-plain">
        {upcoming ? (
          <button type="button" className="pa-btn pa-btn-outline" disabled title="Notifications are not stored yet.">
            <Icon name="bell" size={16} /> Notify me
          </button>
        ) : link === "none" ? (
          <button type="button" className="pa-btn pa-btn-outline" disabled title="Setting up a product needs write support, which is not built yet.">
            <Icon name="plus" size={16} /> Set up {card.name}
          </button>
        ) : link === "linked" && openUrl ? (
          <a className="pa-btn pa-btn-primary" href={openUrl} target="_blank" rel="noopener noreferrer" data-testid={`open-${card.accountKey}`}>
            Open {card.name} <Icon name="arrowUpRight" size={16} />
          </a>
        ) : (
          <button type="button" className="pa-btn pa-btn-primary" disabled title={link === "suspended" ? "This link is suspended." : `${card.name} has no address registered yet.`}>
            Open {card.name} <Icon name="arrowUpRight" size={16} />
          </button>
        )}
        {upcoming ? null : <Link href={`/products/${encodeURIComponent(card.accountKey)}`} className="pa-link pa-view-details" data-testid={`details-${card.accountKey}`}>View details</Link>}
      </div>
    </article>
  );
}

/** The cards of every product, for a business: the link state and the Open address of each come from the Account's overview. `limit` keeps the Overview short. */
export function ProductCards({ products, openUrls, compact = false, limit, className }: { products: Record<string, LinkState>; openUrls?: Partial<Record<string, string>>; compact?: boolean; limit?: number; className: string }) {
  const { state, retry } = useProductCards();
  if (state.phase === "loading") return <StatePanel title="Loading products" busy>One moment.</StatePanel>;
  const fallback: AccountProductCard[] = PRODUCTS.filter((p) => (products[p.id] ?? "none") !== "none").map((p) => ({ key: p.id, accountKey: p.id, name: p.name, tagline: null, imageUrl: null, logoUrl: null, about: null, features: [], status: "LIVE", launchAt: null }));
  const cards = (state.phase === "ready" ? state.cards : fallback).slice(0, limit);
  return (
    <>
      {state.phase === "unavailable" ? <p className="pa-hint" role="status">Product details are not available right now. Only the products you use are shown.{" "}<button type="button" className="pa-link" onClick={retry}>Try again</button></p> : null}
      <div className={className}>
        {cards.map((card) => (
          <ProductCard key={card.key} card={card} link={products[card.accountKey] ?? "none"} openUrl={openUrls?.[card.accountKey]} compact={compact} />
        ))}
      </div>
    </>
  );
}

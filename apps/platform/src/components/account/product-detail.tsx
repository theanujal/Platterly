"use client";

import Link from "next/link";
import type { FeatureIcon } from "@platterly/contract";
import type { LinkState } from "@/modules/account/types";
import { day, useBilling } from "./billing-shared";
import { LINK_TONE, useProductCards } from "./cards";
import { BusinessGate, DataGate, StatePanel } from "./data";
import { Icon, type IconName } from "./icons";
import { AccountShell, useLeafCrumb } from "./shell";
import { Badge } from "./ui";

/** The names Ops uses for a "What you can do" icon, drawn by the Account's own icon set. */
const FEATURE_ICON: Record<FeatureIcon, IconName> = { users: "users", menus: "listCard", orders: "box", payments: "card", calendar: "calendar", delivery: "truck", reports: "chart", security: "shield" };
const STATUS_LABEL: Record<LinkState, string> = { linked: "Available", suspended: "Suspended", none: "Not set up" };
const CONNECTION_LABEL: Record<LinkState, string> = { linked: "Connected", suspended: "Suspended", none: "Not connected" };

function Row({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="pa-detail-row">
      <Icon name={icon} size={20} />
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** A product's details page (AJ's reference, 2026-11-15): the hero, About and "What you can do" from Ops, then Account & access and Subscription. */
export function ProductDetailView({ productKey }: { productKey: string }) {
  return (
    <AccountShell>
      <ProductDetail productKey={productKey} />
    </AccountShell>
  );
}

function ProductDetail({ productKey }: { productKey: string }) {
  const { state } = useProductCards();
  const card = state.phase === "ready" ? state.cards.find((c) => c.accountKey === productKey && c.status === "LIVE") : undefined;
  useLeafCrumb(card?.name ?? null);
  const billing = useBilling();
  const sub = billing.phase === "ready" ? billing.subscriptions.find((x) => x.productKey === productKey) : undefined;
  const end = sub?.current ? (sub.current.status === "TRIALING" ? sub.current.trialEndsAt : sub.current.currentPeriodEnd) : null;
  return (
    <>
      <DataGate>
        {(overview) => (
          <BusinessGate overview={overview}>
            {(b) => {
              if (state.phase === "loading") return <StatePanel title="Loading product" busy>One moment.</StatePanel>;
              if (state.phase === "unavailable") return <StatePanel title="Product details are not available right now" action={<Link href="/products" className="pa-link">Back to My Products</Link>}>Please try again in a few minutes.</StatePanel>;
              if (!card) return <StatePanel title="We could not find this product" action={<Link href="/products" className="pa-link">Back to My Products</Link>}>It may have been removed or is not available yet.</StatePanel>;
              const link: LinkState = b.products[card.accountKey as keyof typeof b.products] ?? "none";
              const openUrl = b.openUrls?.[card.accountKey as keyof typeof b.openUrls];
              return (
                <>
                  <header className="pa-detail-hero">
                    {card.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
                      <img className="pa-detail-logo" src={card.logoUrl} alt="" width={80} height={80} />
                    ) : (
                      <span className="pa-detail-logo pa-detail-letter" aria-hidden="true">{card.name.charAt(0).toUpperCase()}</span>
                    )}
                    <div className="pa-detail-id">
                      <h1>{card.name}</h1>
                      {card.tagline ? <p>{card.tagline}</p> : null}
                      <Badge tone={LINK_TONE[link]}>{STATUS_LABEL[link]}</Badge>
                    </div>
                    {link === "linked" && openUrl ? (
                      <a className="pa-btn pa-btn-primary pa-detail-open" href={openUrl} target="_blank" rel="noopener noreferrer" data-testid="detail-open">
                        Open {card.name} <Icon name="arrowUpRight" size={16} />
                      </a>
                    ) : (
                      <button type="button" className="pa-btn pa-btn-primary pa-detail-open" disabled title={link === "suspended" ? "This link is suspended." : `${card.name} has no address registered yet.`}>
                        Open {card.name} <Icon name="arrowUpRight" size={16} />
                      </button>
                    )}
                  </header>

                  <div className="pa-detail-grid">
                    <section className="pa-card pa-detail-about" aria-label={`About ${card.name}`}>
                      {card.about ? (
                        <>
                          <h2>About {card.name}</h2>
                          <p className="pa-detail-lede">{card.about}</p>
                        </>
                      ) : null}
                      {card.features.length > 0 ? (
                        <>
                          <h3>What you can do</h3>
                          <ul className="pa-detail-features">
                            {card.features.map((f) => (
                              <li key={f.title}>
                                <span className="pa-detail-tile"><Icon name={FEATURE_ICON[f.icon]} size={24} /></span>
                                <div>
                                  <strong>{f.title}</strong>
                                  {f.text ? <p>{f.text}</p> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {!card.about && card.features.length === 0 ? <p className="pa-muted">More about {card.name} will appear here.</p> : null}
                    </section>

                    <div className="pa-detail-side">
                      <section className="pa-card" aria-label="Account and access">
                        <h2>Account &amp; access</h2>
                        <Row icon="layers" label="Product status"><Badge tone={LINK_TONE[link]}>{STATUS_LABEL[link]}</Badge></Row>
                        <Row icon="link" label="Account connection"><Badge tone={LINK_TONE[link]}>{CONNECTION_LABEL[link]}</Badge></Row>
                        <Row icon="user" label="Your role"><strong>{b.business.role}</strong></Row>
                      </section>
                      <section className="pa-card" aria-label="Subscription">
                        <h2>Subscription</h2>
                        {sub?.current ? (
                          <>
                            <Row icon="box" label="Current plan"><strong>{sub.planName ?? sub.product}</strong></Row>
                            {end ? <Row icon="calendar" label={sub.current.status === "TRIALING" ? "Trial ends on" : "Renews on"}><strong>{day(end)}</strong></Row> : null}
                          </>
                        ) : (
                          <p className="pa-muted">{billing.phase === "loading" ? "Loading…" : "No subscription to show for this product."}</p>
                        )}
                        <Link href={`/subscriptions/${encodeURIComponent(card.accountKey)}`} className="pa-btn pa-btn-primary pa-detail-sub" data-testid="detail-subscription">
                          View subscription details <Icon name="chevronRight" size={16} />
                        </Link>
                      </section>
                    </div>
                  </div>
                </>
              );
            }}
          </BusinessGate>
        )}
      </DataGate>
    </>
  );
}

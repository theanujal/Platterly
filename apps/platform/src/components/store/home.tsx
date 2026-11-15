"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/account/icons";
import { inr, longDate } from "@/modules/store/format";
import type { SampleBundle, SampleProduct } from "@/modules/store/sample-catalogue";
import type { StoreBusiness } from "@/modules/store/products";
import type { AccountProductCard } from "@/modules/account/types";
import "./store.css";

/** Platterly's public site, where the sales contact page lives. */
const SITE = "https://platterly.in";
const EMAIL = "hello@platterly.in";

type Tab = "SUBSCRIBED" | "TRIAL" | "NONE" | "BUNDLES";
const LABELS: Record<Tab, string> = { SUBSCRIBED: "Subscribed products", TRIAL: "On trial products", NONE: "Available products", BUNDLES: "Bundles" };
const TABS: Tab[] = ["SUBSCRIBED", "TRIAL", "NONE", "BUNDLES"];
const TONE = { good: "success", info: "info", warn: "warning", bad: "warning", none: "neutral" } as const;

/**
 * The Store home (AJ's design, 2026-11-16): "Manage your products". The business's products by status, the products Ops lists as coming soon, bundles, and the
 * "Explore" and "custom plan" cards. Names, lines, logos and feature chips come from Ops's product cards; nothing here is invented, and a value Ops does not send is left out.
 */
export function StoreHome({ products, bundles, cards = [], accountOrigin = "", live = false, business = null, billing = "ok" }: { products: SampleProduct[]; bundles: SampleBundle[]; cards?: AccountProductCard[]; accountOrigin?: string; live?: boolean; business?: StoreBusiness | null; billing?: "ok" | "unavailable" | "not_applicable" }) {
  const cardOf = (key: string) => cards.find((c) => c.accountKey === key);
  const upcoming = cards.filter((c) => c.status === "UPCOMING");
  const count: Record<Tab, number> = {
    SUBSCRIBED: products.filter((p) => p.status === "SUBSCRIBED").length,
    TRIAL: products.filter((p) => p.status === "TRIAL").length,
    NONE: products.filter((p) => p.status === "NONE").length + upcoming.length,
    BUNDLES: bundles.length,
  };
  // Open on the first tab that has products (real mode starts with nothing subscribed).
  const [tab, setTab] = useState<Tab>(() => (["SUBSCRIBED", "TRIAL", "NONE"] as const).find((s) => (s === "NONE" ? count.NONE : products.some((p) => p.status === s))) ?? "SUBSCRIBED");
  const soon = upcoming;
  const showSoon = (tab === "SUBSCRIBED" || tab === "NONE") && soon.length > 0;

  return (
    <main className="ps-page ps-home">
      <header className="ps-head">
        <h1>Manage your products</h1>
        <p className="ps-lede">Manage your subscriptions, explore available plans and discover more Platterly products.</p>
        {!live && <p className="ps-note" role="note">Prototype with sample data. Nothing is saved or charged.</p>}
      </header>

      {live && business?.state === "none" && <p className="ps-warn" role="alert">You have not set up a business yet. Create it in your Account first; your subscriptions will show here.</p>}
      {live && business?.state === "not_admin" && <p className="ps-warn" role="alert">Plans and payments are managed by your business&apos;s Admin, so its subscriptions are not shown here.</p>}
      {live && business?.state === "forbidden" && <p className="ps-warn" role="alert">Your access to your business has ended, so its subscriptions are not shown.</p>}
      {live && billing === "unavailable" && <p className="ps-warn" role="alert">We could not load your subscriptions just now. The plans below show no subscription until we can; please try again in a few minutes.</p>}

      <div className="ps-layout">
        <div className="ps-main">
        {live && business?.state === "ok" && (
          <section className="ps-biz" aria-label="Business">
            <span className="ps-biz-icon" aria-hidden="true"><Icon name="building" size={30} /></span>
            <div>
              <h2>{business.name}</h2>
              <p>Products and subscriptions for this business</p>
            </div>
          </section>
        )}
          <div role="tablist" aria-label="Products" className="ps-toggle ps-tabs">
            {TABS.map((id) => (
              <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}>
                {LABELS[id]} ({count[id]})
              </button>
            ))}
          </div>

          <section role="tabpanel" aria-label={LABELS[tab]} className="ps-panel">
            {tab !== "BUNDLES" && (
              <h2 className="ps-h2">
                {tab === "NONE" ? "Available products" : tab === "TRIAL" ? "On trial" : "Your products"}
                {tab === "SUBSCRIBED" && count.SUBSCRIBED > 0 && <span className="ps-count">{count.SUBSCRIBED} active subscription{count.SUBSCRIBED === 1 ? "" : "s"}</span>}
              </h2>
            )}
            {tab === "SUBSCRIBED" && <Subscribed products={products.filter((p) => p.status === "SUBSCRIBED")} cardOf={cardOf} />}
            {tab === "TRIAL" && (
              <CardList empty="No products on trial." products={products.filter((p) => p.status === "TRIAL")}>
                {(p) => <ProductCard key={p.key} product={p} card={cardOf(p.key)} facts={[{ icon: "calendar", label: "Trial ends on", value: longDate(p.trialEndsAt!) }]} action="Choose a plan" />}
              </CardList>
            )}
            {tab === "NONE" && (
              <CardList empty={soon.length ? "" : "No available products."} products={products.filter((p) => p.status === "NONE")}>
                {(p) => <ProductCard key={p.key} product={p} card={cardOf(p.key)} lines={[...(p.display ? [p.display.detail] : []), p.tagline]} action={p.display ? "Choose a plan" : "View plans"} />}
              </CardList>
            )}
            {tab === "BUNDLES" && <Bundles bundles={bundles} products={products} />}
            {showSoon && (
              <section className="ps-soon-section" aria-label="Explore more from Platterly">
                <h2 className="ps-h2">Explore more from Platterly</h2>
                <p className="ps-sub">Discover additional tools and solutions to support your business.</p>
                <ul className="ps-cards">
                  {soon.map((c) => <li key={c.key}><ComingSoon card={c} /></li>)}
                </ul>
              </section>
            )}
          </section>
        </div>

        <aside className="ps-rail" aria-label="More from Platterly">
          <section className="ps-rail-card ps-explore">
            <div className="ps-tiles" aria-hidden="true">
              <span className="ps-tile ps-tile-a"><Icon name="utensils" size={26} /></span>
              <span className="ps-tile ps-tile-b"><Icon name="layers" size={26} /></span>
              <span className="ps-tile ps-tile-c"><Icon name="plus" size={26} /></span>
            </div>
            <h2>Discover more products</h2>
            <p>Explore additional solutions and bundles built for food businesses.</p>
            <button type="button" className="ps-outline" onClick={() => setTab("NONE")}>View available products</button>
          </section>
          <section className="ps-rail-card ps-custom">
            <span className="ps-custom-icon" aria-hidden="true"><Icon name="gift" size={26} /></span>
            <div>
              <h2>Need a custom plan?</h2>
              <p>Looking for a different combination of products, special pricing or an enterprise solution?</p>
              <a className="ps-textlink" href={`${SITE}/talk-to-us/`}>Talk to our sales team <Icon name="arrowRight" size={16} /></a>
            </div>
          </section>
          <section className="ps-rail-card ps-quick" aria-label="Quick links">
            <h2><span className="ps-quick-icon" aria-hidden="true"><Icon name="link" size={20} /></span>Quick links</h2>
            <ul>
              {accountOrigin ? <li><a href={`${accountOrigin}/invoices`}><Icon name="receipt" size={18} />Your invoices<Icon name="arrowRight" size={16} /></a></li> : null}
              <li><a href={`${SITE}/contact/`}><Icon name="lifebuoy" size={18} />Help centre<Icon name="arrowRight" size={16} /></a></li>
              <li><a href={`mailto:${EMAIL}`}><Icon name="mail" size={18} />Contact support<Icon name="arrowRight" size={16} /></a></li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function CardList({ products, empty, children }: { products: SampleProduct[]; empty: string; children: (p: SampleProduct) => React.ReactNode }) {
  if (!products.length) return empty ? <p className="ps-empty">{empty}</p> : null;
  return <ul className="ps-cards">{products.map((p) => <li key={p.key}>{children(p)}</li>)}</ul>;
}

function Subscribed({ products, cardOf }: { products: SampleProduct[]; cardOf: (key: string) => AccountProductCard | undefined }) {
  return (
    <CardList empty="No subscribed products yet." products={products}>
      {(p) => {
        const sub = p.subscription!;
        // A plan that is not on sale any more (or was assigned by hand) is not in the list: show its name and leave the amount out.
        const current = p.plans.find((plan) => plan.id === sub.planId);
        const amount = current ? (sub.interval === "ANNUAL" ? current.annual : current.monthly)?.total : undefined;
        const facts: Fact[] = [
          { icon: "layers", label: "Current plan", value: current?.name ?? sub.planName ?? "Your plan" },
          { icon: "calendar", label: "Next renewal", value: longDate(sub.nextRenewal) },
          ...(amount === undefined ? [] : [{ icon: "card" as const, label: "Renewal amount", value: `${inr(amount)} / ${sub.interval === "ANNUAL" ? "year" : "month"}` }]),
        ];
        return <ProductCard product={p} card={cardOf(p.key)} facts={facts} lines={p.display && p.display.state !== "active" ? [p.display.detail] : []} action="Manage subscription" />;
      }}
    </CardList>
  );
}

type Fact = { icon: "layers" | "calendar" | "card"; label: string; value: string };

function Logo({ product, card }: { product: { key: string; name: string }; card?: AccountProductCard }) {
  return card?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
    <img className="ps-logo-img" src={`/api/product-logo/${encodeURIComponent(product.key)}`} alt="" width={48} height={48} />
  ) : (
    <span className="ps-icon" aria-hidden="true">{product.name[0]}</span>
  );
}

function ProductCard({ product, card, facts = [], lines = [], action }: { product: SampleProduct; card?: AccountProductCard; facts?: Fact[]; lines?: string[]; action: string }) {
  const tone = product.display ? TONE[product.display.tone] ?? "neutral" : "success";
  const label = product.status === "NONE" ? null : product.display?.label ?? (product.status === "TRIAL" ? "On trial" : "Active");
  const tagline = card?.tagline ?? (product.status === "NONE" ? null : product.tagline);
  return (
    <article className={`ps-card ps-pcard${product.status === "SUBSCRIBED" ? " is-live" : ""}`} aria-label={product.name}>
      <div className="ps-pcard-head">
        <Logo product={product} card={card} />
        <div className="ps-pcard-id">
          <h3>{product.name}</h3>
          {tagline ? <p>{tagline}</p> : null}
        </div>
        {label ? <span className={`ps-badge ps-badge-${tone}`}>{tone === "success" ? <Icon name="check" size={14} /> : null}{label}</span> : null}
      </div>
      {facts.length > 0 && (
        <dl className="ps-facts">
          {facts.map((f) => (
            <div key={f.label}><Icon name={f.icon} size={20} /><dt>{f.label}</dt><dd>{f.value}</dd></div>
          ))}
        </dl>
      )}
      {lines.length > 0 && (
        <div className="ps-pcard-lines">
          {lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
      <div className="ps-pcard-foot">
        {card && card.features.length > 0 ? (
          <ul className="ps-feats" aria-label="Included">
            {card.features.slice(0, 4).map((f) => <li key={f.title}><Icon name="check" size={14} />{f.title}</li>)}
          </ul>
        ) : <span />}
        <Link className="ps-cta ps-cta-card" href={`/manage/${product.key}`}>{action} <Icon name="arrowRight" size={16} /></Link>
      </div>
    </article>
  );
}

function ComingSoon({ card }: { card: AccountProductCard }) {
  return (
    <article className="ps-card ps-pcard ps-soon" aria-label={card.name}>
      <div className="ps-pcard-head">
        {card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
          <img className="ps-logo-img" src={`/api/product-logo/${encodeURIComponent(card.accountKey)}`} alt="" width={48} height={48} />
        ) : (
          <span className="ps-icon ps-icon-soon" aria-hidden="true">{card.name[0]}</span>
        )}
        <div className="ps-pcard-id">
          <h3>{card.name}</h3>
          {card.tagline ? <p>{card.tagline}</p> : null}
        </div>
        <span className="ps-badge ps-badge-violet"><Icon name="history" size={14} />Coming soon</span>
      </div>
      <div className="ps-pcard-foot">
        <p className="ps-soon-text">{card.about ?? `Be the first to access ${card.name} when it is available.`}</p>
        <button type="button" className="ps-outline" disabled title="Notifications are not stored yet."><Icon name="bell" size={16} /> Notify me</button>
      </div>
    </article>
  );
}

function Bundles({ bundles, products }: { bundles: SampleBundle[]; products: SampleProduct[] }) {
  if (!bundles.length) return <p className="ps-empty">No bundles yet.</p>;
  return (
    <ul className="ps-cards">
      {bundles.map((b) => (
        <li key={b.key}>
          <article className="ps-card ps-pcard" aria-label={b.name}>
            <h3>{b.name}</h3>
            <p className="ps-desc">Includes {b.productKeys.map((k) => products.find((p) => p.key === k)?.name ?? k).join(" and ")}</p>
            <div className="ps-pcard-lines">
              <p>{inr(b.monthly.total)} / month <span className="ps-save">Save {inr(b.separateMonthlyTotal - b.monthly.total)} a month</span></p>
              <p>{inr(b.annual.total)} / year <span className="ps-save">Save {inr(b.separateAnnualTotal - b.annual.total)} a year</span></p>
              <p className="ps-hint">Prices include GST. Compared with buying the same plans separately.</p>
            </div>
            <button type="button" className="ps-cta" disabled title="Bundle checkout arrives with a later release">View bundle</button>
          </article>
        </li>
      ))}
    </ul>
  );
}

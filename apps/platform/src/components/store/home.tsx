"use client";

import { useState } from "react";
import Link from "next/link";
import { inr, longDate } from "@/modules/store/format";
import type { SampleBundle, SampleProduct } from "@/modules/store/sample-catalogue";
import type { StoreBusiness } from "@/modules/store/products";
import "./store.css";

type Tab = "SUBSCRIBED" | "TRIAL" | "NONE" | "BUNDLES";
const TABS: { id: Tab; label: string }[] = [
  { id: "SUBSCRIBED", label: "Subscribed products" },
  { id: "TRIAL", label: "On trial products" },
  { id: "NONE", label: "Unsubscribed products" },
  { id: "BUNDLES", label: "Bundles" },
];

/** The Store home (prototype): the business's products by status, plus bundles. Sample data; nothing is saved or charged. */
export function StoreHome({ products, bundles, live = false, business = null, billing = "ok" }: { products: SampleProduct[]; bundles: SampleBundle[]; live?: boolean; business?: StoreBusiness | null; billing?: "ok" | "unavailable" | "not_applicable" }) {
  // Open on the first tab that has products (real mode starts with nothing subscribed).
  const [tab, setTab] = useState<Tab>(() => ((["SUBSCRIBED", "TRIAL", "NONE"] as const).find((s) => products.some((p) => p.status === s)) ?? "SUBSCRIBED"));
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const byName = (name: string) => !q || name.toLowerCase().includes(q);

  return (
    <main className="ps-page ps-home">
      <header className="ps-head">
        <h1>Your products</h1>
        <p className="ps-lede">See what your business subscribes to, or add another product. Prices include GST.</p>
        <p className="ps-note" role="note">{live ? (business?.state === "ok" ? `Showing ${business.name}. Plans, prices and your subscriptions are live from Platterly.` : "Plans and prices are live from Platterly.") : "Prototype with sample data. Nothing is saved or charged."}</p>
      </header>

      {live && business?.state === "none" && <p className="ps-warn" role="alert">You have not set up a business yet. Create it in your Account first; your subscriptions will show here.</p>}
      {live && business?.state === "forbidden" && <p className="ps-warn" role="alert">Your access to your business has ended, so its subscriptions are not shown.</p>}
      {live && billing === "unavailable" && <p className="ps-warn" role="alert">We could not load your subscriptions just now. The plans below show no subscription until we can; please try again in a few minutes.</p>}

      <div className="ps-tabbar">
        <div role="tablist" aria-label="Products" className="ps-toggle ps-tabs">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <input className="ps-search" type="search" aria-label="Search products" placeholder="Which product are you seeking?" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <section role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label} className="ps-panel">
        {tab === "SUBSCRIBED" && <Subscribed products={products.filter((p) => p.status === "SUBSCRIBED" && byName(p.name))} />}
        {tab === "TRIAL" && (
          <CardList empty="No products on trial." products={products.filter((p) => p.status === "TRIAL" && byName(p.name))}>
            {(p) => (
              <ProductCard key={p.key} product={p} lines={[`Trial ends on ${longDate(p.trialEndsAt!)}`]} action="Choose a plan" />
            )}
          </CardList>
        )}
        {tab === "NONE" && (
          <CardList empty="No unsubscribed products." products={products.filter((p) => p.status === "NONE" && byName(p.name))}>
            {(p) => <ProductCard key={p.key} product={p} lines={[...(p.display ? [p.display.detail] : []), p.tagline]} action={p.display ? "Choose a plan" : "View plans"} />}
          </CardList>
        )}
        {tab === "BUNDLES" && <Bundles bundles={bundles.filter((b) => byName(b.name))} products={products} />}
      </section>
    </main>
  );
}

function CardList({ products, empty, children }: { products: SampleProduct[]; empty: string; children: (p: SampleProduct) => React.ReactNode }) {
  if (!products.length) return <p className="ps-empty">{empty}</p>;
  return <ul className="ps-cards">{products.map((p) => <li key={p.key}>{children(p)}</li>)}</ul>;
}

function Subscribed({ products }: { products: SampleProduct[] }) {
  return (
    <CardList empty="No subscribed products match." products={products}>
      {(p) => {
        const sub = p.subscription!;
        // A plan that is not on sale any more (or was assigned by hand) is not in the list: show its name and leave the amount out.
        const current = p.plans.find((plan) => plan.id === sub.planId);
        const amount = current ? (sub.interval === "ANNUAL" ? current.annual : current.monthly)?.total : undefined;
        return (
          <ProductCard
            product={p}
            lines={[current?.name ?? sub.planName ?? "Your plan", ...(p.display && p.display.state !== "active" ? [p.display.detail] : []), `Next renewal date: ${longDate(sub.nextRenewal)}`, ...(amount === undefined ? [] : [`Renewal amount: ${inr(amount)} / ${sub.interval === "ANNUAL" ? "year" : "month"}`])]}
            action="Manage"
          />
        );
      }}
    </CardList>
  );
}

function ProductCard({ product, lines, action }: { product: SampleProduct; lines: string[]; action: string }) {
  return (
    <article className="ps-card ps-pcard" aria-label={product.name}>
      <div className="ps-pcard-head">
        <span className="ps-icon" aria-hidden="true">{product.name[0]}</span>
        <h3>{product.name}</h3>
      </div>
      <div className="ps-pcard-lines">
        {lines.map((line) => <p key={line}>{line}</p>)}
      </div>
      <Link className="ps-link" href={`/manage/${product.key}`}>{action} &rarr;</Link>
    </article>
  );
}

function Bundles({ bundles, products }: { bundles: SampleBundle[]; products: SampleProduct[] }) {
  if (!bundles.length) return <p className="ps-empty">No bundles match.</p>;
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

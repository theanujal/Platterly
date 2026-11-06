"use client";

import { initials, LINK_LABEL, STATUS_LABEL } from "@/lib/account/catalogue";
import type { BusinessSummary, LinkState, ProductKey } from "@/modules/account/types";
import { Icon } from "./icons";
import { Avatar, Badge, type Tone } from "./ui";

export const STATUS_TONE: Record<BusinessSummary["status"], Tone> = { active: "success", suspended: "warning" };
export const LINK_TONE: Record<LinkState, Tone> = { linked: "success", suspended: "warning", none: "neutral" };
const LINK_DETAIL: Record<LinkState, string> = { linked: "Linked to this business", suspended: "The link is suspended", none: "Not set up for this business" };

export function BusinessCard({ business, products }: { business: BusinessSummary; products: Record<ProductKey, LinkState> }) {
  const linked = Object.values(products).filter((l) => l !== "none").length;
  return (
    <article className="pa-card pa-business" aria-label={business.name}>
      <div className="pa-business-top">
        <Avatar label={initials(business.name)} size="lg" />
        <div className="pa-business-id">
          <h3>{business.name}</h3>
          <p>{linked === 1 ? "1 product linked" : `${linked} products linked`}</p>
        </div>
      </div>
      <div className="pa-chips">
        <Badge tone={STATUS_TONE[business.status]}>{STATUS_LABEL[business.status]}</Badge>
        <span className="pa-chip">{business.role}</span>
      </div>
      <dl className="pa-facts">
        <div>
          <dt>Your role</dt>
          <dd>{business.role}</dd>
        </div>
        <div>
          <dt>Caterly</dt>
          <dd>{LINK_LABEL[products.caterly]}</dd>
        </div>
      </dl>
    </article>
  );
}

export function CaterlyCard({ business, link, selected = false }: { business: BusinessSummary; link: LinkState; selected?: boolean }) {
  return (
    <article className={`pa-card pa-product${selected ? " is-selected" : ""}`} aria-label="Caterly" data-selected={selected}>
      <div className="pa-product-top">
        <span className="pa-product-mark">
          <Icon name="utensils" size={22} />
        </span>
        <div className="pa-product-id">
          <h3>Caterly</h3>
          <p>Run catering from enquiry to event: customers, menus, orders, kitchen and payments in one place.</p>
        </div>
        <Badge tone="success">Available</Badge>
      </div>
      <div className="pa-product-for">
        <span className="pa-product-for-cap">For {business.name}</span>
        <span className="pa-product-for-row">
          <Badge tone={LINK_TONE[link]}>{LINK_LABEL[link]}</Badge>
          <span className="pa-muted">{LINK_DETAIL[link]}</span>
        </span>
      </div>
      <div className="pa-card-foot">
        {link === "none" ? (
          <button type="button" className="pa-btn pa-btn-outline" disabled title="Setting up a product needs write support, which is not built yet.">
            <Icon name="plus" size={16} /> Set up Caterly
          </button>
        ) : (
          <button type="button" className="pa-btn pa-btn-primary" disabled title="Opening a product needs sign-in (F4), which is not built yet.">
            Open Caterly <Icon name="arrowUpRight" size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

export function RivoCard({ selected = false }: { selected?: boolean }) {
  return (
    <article className={`pa-card pa-product pa-product-soon${selected ? " is-selected" : ""}`} aria-label="Rivo" data-selected={selected}>
      <div className="pa-product-top">
        <span className="pa-product-mark pa-product-mark-soon">
          <Icon name="layers" size={22} />
        </span>
        <div className="pa-product-id">
          <h3>Rivo</h3>
          <p>A new Platterly product, in development. Details will be announced here.</p>
        </div>
        <Badge tone="neutral">Coming soon</Badge>
      </div>
      <div className="pa-product-for">
        <span className="pa-product-for-cap">Availability</span>
        <span className="pa-muted">Not available to any business yet</span>
      </div>
      <div className="pa-card-foot">
        <button type="button" className="pa-btn pa-btn-outline" disabled title="Notifications are not stored yet.">
          <Icon name="bell" size={16} /> Notify me
        </button>
      </div>
    </article>
  );
}


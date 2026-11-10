"use client";

import { initials, LINK_LABEL } from "@/lib/account/catalogue";
import type { BusinessSummary, LinkState, TeamMemberView } from "@/modules/account/types";
import { Icon } from "./icons";
import { Avatar, Badge, type Tone } from "./ui";

export const STATUS_TONE: Record<BusinessSummary["status"], Tone> = { active: "success", suspended: "warning" };
export const LINK_TONE: Record<LinkState, Tone> = { linked: "success", suspended: "warning", none: "neutral" };
const LINK_DETAIL: Record<LinkState, string> = { linked: "Linked to this business", suspended: "The link is suspended", none: "Not set up for this business" };

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


const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

/** Read-only list of the other people a product shows for this business. They are not Platform members and cannot sign in to manage it here. */
export function TeamCard({ product, team }: { product: string; team: TeamMemberView[] }) {
  return (
    <article className="pa-card pa-business" aria-label={`${product} team`}>
      <div className="pa-business-id">
        <h3>{product} team</h3>
        <p>Other people listed in {product} for this business. Read-only: they are not Platform members.</p>
      </div>
      {team.length === 0 ? (
        <p className="pa-muted">No other people are listed.</p>
      ) : (
        <ul className="pa-team-list">
          {team.map((m) => (
            <li key={m.id} className="pa-team-row">
              <Avatar label={initials(m.name)} size="sm" />
              <span className="pa-team-who">
                <strong>{m.name}</strong>
                <span className="pa-muted">{m.email}</span>
              </span>
              <span className="pa-chip">{roleLabel(m.role)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

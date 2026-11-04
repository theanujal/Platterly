"use client";

import { useEffect, useRef, useState } from "react";
import { initials, LINK_LABEL, STATUS_LABEL, type Business, type BusinessStatus, type ProductLink, type ProductLinkStatus } from "@/lib/account/mock-data";
import { Icon } from "./icons";
import { dispatch, useAccount } from "./store";
import { Avatar, Badge, type Tone } from "./ui";

export const STATUS_TONE: Record<BusinessStatus, Tone> = { active: "success", trial: "info", setup: "warning" };
export const LINK_TONE: Record<ProductLinkStatus, Tone> = { active: "success", trial: "info", none: "neutral" };

export function BusinessCard({ business, link, selected }: { business: Business; link: ProductLink; selected: boolean }) {
  return (
    <article className={`pa-card pa-business${selected ? " is-selected" : ""}`} aria-label={business.name} data-selected={selected}>
      <div className="pa-business-top">
        <Avatar label={initials(business.name)} size="lg" />
        <div className="pa-business-id">
          <h3>{business.name}</h3>
          <p>
            {business.type} · {business.city}
          </p>
        </div>
      </div>
      <div className="pa-chips">
        <Badge tone={STATUS_TONE[business.status]}>{STATUS_LABEL[business.status]}</Badge>
        <span className="pa-chip">{business.role}</span>
      </div>
      <dl className="pa-facts">
        <div>
          <dt>Caterly</dt>
          <dd>{LINK_LABEL[link.status]}</dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>{business.members} members</dd>
        </div>
      </dl>
      <div className="pa-card-foot">
        {selected ? (
          <span className="pa-selected-mark">
            <Icon name="check" size={16} /> Selected
          </span>
        ) : (
          <button type="button" className="pa-btn pa-btn-outline" aria-label={`Switch to ${business.name}`} onClick={() => dispatch({ type: "selectBusiness", id: business.id })}>
            Switch to this business
          </button>
        )}
      </div>
    </article>
  );
}

const STEPS = ["Checking your access", "Preparing the workspace", "Ready"];

/** A stand-in for the real launch: it walks through the steps the real hand-off will have and then stops. No sign-in is connected. */
function LaunchDialog({ business, onClose }: { business: Business; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    ref.current?.showModal();
    const timers = [setTimeout(() => setStep(1), 700), setTimeout(() => setStep(2), 1500)];
    return () => timers.forEach(clearTimeout);
  }, []);

  const ready = step >= 2;
  return (
    <dialog ref={ref} className="pa-dialog" aria-labelledby="pa-launch-title" onClose={onClose}>
      <div className="pa-dialog-body">
        <div className="pa-dialog-head">
          <span className="pa-product-mark">
            <Icon name="utensils" size={22} />
          </span>
          <div>
            <h2 id="pa-launch-title">{ready ? "Caterly is ready" : "Opening Caterly"}</h2>
            <p>for {business.name}</p>
          </div>
        </div>
        <ol className="pa-steps" aria-live="polite">
          {STEPS.map((label, i) => (
            <li key={label} className={i < step || (ready && i === 2) ? "is-done" : i === step ? "is-now" : ""}>
              <span className="pa-step-dot" aria-hidden="true">
                {i < step || (ready && i === 2) ? <Icon name="check" size={12} /> : null}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {ready && <p className="pa-dialog-note">Prototype only: sign-in is not connected yet, so Caterly does not open from here.</p>}
        <div className="pa-dialog-foot">
          <button type="button" className="pa-btn pa-btn-primary" onClick={() => ref.current?.close()}>
            {ready ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function CaterlyCard({ business, link }: { business: Business; link: ProductLink }) {
  const [launching, setLaunching] = useState(false);
  return (
    <article className="pa-card pa-product" aria-label="Caterly">
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
          <Badge tone={LINK_TONE[link.status]}>{LINK_LABEL[link.status]}</Badge>
          <span className="pa-muted">{link.detail}</span>
        </span>
      </div>
      <div className="pa-card-foot">
        {link.status === "none" ? (
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => dispatch({ type: "setUpCaterly", businessId: business.id })}>
            <Icon name="plus" size={16} /> Set up Caterly
          </button>
        ) : (
          <button type="button" className="pa-btn pa-btn-primary" onClick={() => setLaunching(true)}>
            Open Caterly <Icon name="arrowUpRight" size={16} />
          </button>
        )}
      </div>
      {launching && <LaunchDialog business={business} onClose={() => setLaunching(false)} />}
    </article>
  );
}

export function RivoCard() {
  const { rivoNotify } = useAccount();
  return (
    <article className="pa-card pa-product pa-product-soon" aria-label="Rivo">
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
        <button type="button" className={`pa-btn ${rivoNotify ? "pa-btn-ghost-on" : "pa-btn-outline"}`} aria-pressed={rivoNotify} onClick={() => dispatch({ type: "toggleRivoNotify" })}>
          <Icon name={rivoNotify ? "check" : "bell"} size={16} /> {rivoNotify ? "We will let you know" : "Notify me"}
        </button>
      </div>
    </article>
  );
}

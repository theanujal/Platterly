"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ProductBillingProfileRecord } from "@platterly/contract";
import { useProductCards } from "./cards";
import { Icon } from "./icons";
import { AccountShell, useLeafCrumb } from "./shell";
import { Badge } from "./ui";
import { PhoneField } from "../phone-field";
import { billingComplete } from "@/modules/store/profile-ready";

/**
 * The Account's Business & Billing pages (AJ's design, 2026-11-16): a list of the business's products with how complete each profile is, and one page per product
 * with its Business Profile and Billing Profile cards and a Change History tab. The record behind both cards is one billing profile per product kept in Ops and shared
 * with the product's own Business Profile. Only the business's Admin can open or change it. A save names the version it was based on; when the profile changed
 * elsewhere meanwhile, the person's edits stay in the form and a notice says so.
 */

type Product = { productKey: string; name: string };
type Loaded = { businessName: string; products: Product[]; profiles: ProductBillingProfileRecord[]; prefill?: Prefill };
type Prefill = { contactName: string; contactEmail: string; contactPhone: string } | null;
type State = { phase: "loading" } | { phase: "error" } | { phase: "no_business" } | { phase: "not_admin" } | ({ phase: "ready" } & Loaded);

const STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
// Platterly bills in India only for now, so India is the one country; GST invoices need an Indian state.
const COUNTRY = "India";
/** Products that number their orders (and so share prefix, next number and digits on both pages). */
const ORDER_NUMBERING_PRODUCTS = ["catering"];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });

/** What each side needs before it counts as complete. The billing side is what an invoice needs; the business side is the brand name customers see. */
const filled = (v: string | null | undefined) => Boolean(v && v.trim());
export const businessComplete = (p: ProductBillingProfileRecord | null) => Boolean(p && filled(p.brandName));
export { billingComplete } from "@/modules/store/profile-ready";
const isComplete = (p: ProductBillingProfileRecord | null) => businessComplete(p) && billingComplete(p);

function useProfiles() {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/billing-profiles", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (res.status === 401) return window.location.replace("/auth/start?next=%2Fbilling-details");
        const body = (await res.json().catch(() => null)) as (Loaded & { status?: string }) | null;
        if (!alive) return;
        if (res.status === 409) return setState({ phase: "no_business" });
        if (res.status === 403) return setState({ phase: "not_admin" });
        if (res.ok && body?.status === "ok") setState({ phase: "ready", businessName: body.businessName, products: body.products, profiles: body.profiles, prefill: body.prefill ?? null });
        else setState({ phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { state, setState };
}

function Gate({ state, children }: { state: State; children: (s: Extract<State, { phase: "ready" }>) => ReactNode }) {
  if (state.phase === "loading") return <p className="pa-muted" role="status" aria-busy="true">Loading your business and billing profiles…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load your profiles just now. Please reload the page in a few minutes.</p>;
  if (state.phase === "no_business") return <p className="pa-muted" role="status">You have not set up a business yet, so there are no profiles to show.</p>;
  if (state.phase === "not_admin") return <p className="pa-muted" role="status">Business and billing profiles are available to the business Admin only.</p>;
  return <>{children(state)}</>;
}

function ProductTile({ productKey, name }: { productKey: string; name: string }) {
  const { state } = useProductCards();
  const card = state.phase === "ready" ? state.cards.find((c) => c.key === productKey) : undefined;
  return card?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the logo is this app's own route
    <img className="pa-bb-tile" src={card.logoUrl} alt="" width={56} height={56} />
  ) : (
    <span className="pa-bb-tile pa-bb-letter" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
  );
}

/* ---------------------------------------------------------------- the list */

export function BusinessBillingList() {
  const { state } = useProfiles();
  return (
    <Gate state={state}>
      {(s) => {
        const rows = s.products.map((p) => ({ ...p, profile: s.profiles.find((x) => x.productKey === p.productKey) ?? null }));
        const done = rows.filter((r) => isComplete(r.profile)).length;
        const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;
        return (
          <div className="pa-stack" data-testid="business-billing">
            <section className="pa-card pa-bb-completion" aria-label="Profile completion">
              <span className="pa-detail-tile"><Icon name="building" size={24} /></span>
              <div className="pa-bb-completion-text">
                <h2>Profile completion</h2>
                <p className="pa-muted">{rows.length ? `${done} of ${rows.length} product profile${rows.length === 1 ? " is" : "s are"} complete.` : "Your business does not use any product yet."}</p>
              </div>
              <strong>{percent}% complete</strong>
              <div className="pa-bb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Profile completion"><span style={{ width: `${percent}%` }} /></div>
            </section>
            {rows.length > 0 && <h2 className="pa-bb-section">Your product profiles</h2>}
            {rows.map((r) => {
              const biz = businessComplete(r.profile);
              const bill = billingComplete(r.profile);
              const complete = biz && bill;
              return (
                <article key={r.productKey} className="pa-card pa-bb-row" aria-label={r.name}>
                  <ProductTile productKey={r.productKey} name={r.name} />
                  <div className="pa-bb-row-main">
                    <div className="pa-bb-row-head">
                      <div>
                        <h3>{r.name}</h3>
                        <p className="pa-muted">{r.profile?.name || s.businessName}</p>
                      </div>
                      <Badge tone={complete ? "success" : "warning"}>{complete ? "Complete" : "Incomplete"}</Badge>
                    </div>
                    <div className="pa-bb-chips">
                      <span className={`pa-bb-chip ${biz ? "is-ok" : "is-missing"}`}><Icon name={biz ? "check" : "x"} size={14} /> Business profile{biz ? "" : " (missing details)"}</span>
                      <span className={`pa-bb-chip ${bill ? "is-ok" : "is-missing"}`}><Icon name={bill ? "check" : "x"} size={14} /> Billing profile{bill ? "" : " (missing details)"}</span>
                    </div>
                  </div>
                  <Link href={`/billing-details/${encodeURIComponent(r.productKey)}`} className={`pa-btn ${complete ? "pa-btn-outline" : "pa-btn-primary"}`}>
                    {complete ? "Manage" : "Complete"} <Icon name="arrowRight" size={16} />
                  </Link>
                </article>
              );
            })}
            <section className="pa-card pa-bb-how" aria-label="How it works">
              <h2><Icon name="helpCircle" size={20} /> How it works</h2>
              <div className="pa-bb-how-grid">
                <div>
                  <Icon name="link" size={22} />
                  <h3>Single source of truth</h3>
                  <p className="pa-muted">Edit here or inside the product (e.g. Caterly). Both stay in sync.</p>
                </div>
                <div>
                  <Icon name="history" size={22} />
                  <h3>Audited changes</h3>
                  <p className="pa-muted">All updates are tracked with an audit history.</p>
                </div>
                <div>
                  <Icon name="shieldCheck" size={22} />
                  <h3>Invoice safety</h3>
                  <p className="pa-muted">Changes apply to future invoices only. Previously issued invoices remain unchanged.</p>
                </div>
              </div>
            </section>
          </div>
        );
      }}
    </Gate>
  );
}

/* ------------------------------------------------------------- the details */

type Field = "logoUrl" | "brandName" | "description" | "website" | "instagram" | "facebook" | "name" | "contactName" | "contactEmail" | "contactPhone" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country" | "gstin" | "businessPhone" | "orderNumberPrefix" | "orderNumberNextValue" | "orderNumberPadding";
type Errors = Partial<Record<Field, string>>;
type Values = Record<Field, string>;
type Notice = { kind: "saved" | "failed"; text: string };

/** A saved profile fills the form; a product with none starts from the business name and the person's own contact. */
function toValues(p: ProductBillingProfileRecord | null, businessName: string, prefill?: Prefill): Values {
  const b = p;
  return {
    name: b?.name || businessName,
    logoUrl: p?.logoUrl ?? "",
    brandName: p?.brandName ?? "",
    description: p?.description ?? "",
    website: p?.website ?? "",
    instagram: p?.instagram ?? "",
    facebook: p?.facebook ?? "",
    contactName: b?.contactName || prefill?.contactName || "",
    contactEmail: b?.contactEmail || prefill?.contactEmail || "",
    contactPhone: b?.contactPhone || prefill?.contactPhone || "",
    addressLine1: b?.addressLine1 ?? "",
    addressLine2: b?.addressLine2 ?? "",
    city: b?.city ?? "",
    state: b?.state ?? "",
    postalCode: b?.postalCode ?? "",
    country: b?.country || COUNTRY,
    gstin: b?.gstin ?? "",
    businessPhone: b?.businessPhone || prefill?.contactPhone || "",
    orderNumberPrefix: p?.orderNumberPrefix ?? "",
    orderNumberNextValue: p?.orderNumberNextValue ?? "",
    orderNumberPadding: p?.orderNumberPadding ?? "",
  };
}

function Input({ id, label, optional, span, values, errors, onChange, maxLength, type = "text", autoComplete, hint }: { id: Field; label: string; optional?: boolean; span: 2 | 3 | 6; values: Values; errors: Errors; onChange: (key: Field, value: string) => void; maxLength: number; type?: string; autoComplete: string; hint?: string }) {
  const error = errors[id];
  return (
    <div className={`pa-field pa-span-${span}`}>
      <label htmlFor={`bd-${id}`}>
        {label} {optional ? <span className="pa-optional">(Optional)</span> : <span className="pa-required" aria-hidden="true">*</span>}
      </label>
      <input id={`bd-${id}`} type={type} value={values[id]} maxLength={maxLength} autoComplete={autoComplete} aria-required={optional ? undefined : true} aria-invalid={error ? true : undefined} aria-describedby={error ? `bd-${id}-err` : undefined} onChange={(e) => onChange(id, e.target.value)} />
      {error ? <span className="pa-hint" id={`bd-${id}-err`} role="alert">{error}</span> : hint ? <span className="pa-hint">{hint}</span> : null}
    </div>
  );
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`pa-bb-item${wide ? " is-wide" : ""}`}>
      <span className="pa-bb-label">{label}</span>
      <span className="pa-bb-value">{children}</span>
    </div>
  );
}
const dash = (v: string | null | undefined) => (v && v.trim() ? v : <span className="pa-muted">Not added</span>);
const host = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

type HistoryEntry = { at: string; version: number; source: string; created: boolean; by: "you" | "someone" | "product" | "payment"; changes: { field: string; from: string | null; to: string | null }[] };
const FIELD_LABEL: Record<string, string> = { name: "Legal billing name", brandName: "Brand name", contactName: "Billing contact", contactEmail: "Billing email", contactPhone: "Billing phone", addressLine1: "Address line 1", addressLine2: "Address line 2", city: "City", state: "State", postalCode: "PIN code", country: "Country", gstin: "GSTIN", description: "Description", website: "Website", instagram: "Instagram", facebook: "Facebook", logoUrl: "Logo" };

function History({ productKey, productName, version }: { productKey: string; productName: string; version: number | null }) {
  const [rows, setRows] = useState<HistoryEntry[] | "loading" | "error">("loading");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/account/billing-profiles/${encodeURIComponent(productKey)}/history`, { cache: "no-store", credentials: "same-origin" });
        const body = (await res.json().catch(() => null)) as { status?: string; history?: HistoryEntry[] } | null;
        if (live) setRows(res.ok && body?.history ? body.history : "error");
      } catch {
        if (live) setRows("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [productKey, version]);
  if (rows === "loading") return <p className="pa-muted" role="status" aria-busy="true">Loading the change history…</p>;
  if (rows === "error") return <p className="pa-muted" role="alert">We could not load the change history just now.</p>;
  if (rows.length === 0) return <section className="pa-card"><p className="pa-muted" role="status">No changes have been recorded for this profile yet.</p></section>;
  return (
    <section className="pa-card" aria-label="Change history" data-testid="bb-history">
      <ul className="pa-bb-history">
        {rows.map((r) => (
          <li key={`${r.at}-${r.version}`}>
            <div className="pa-bb-history-head">
              <strong>{r.created ? "Profile created" : `${r.changes.length} change${r.changes.length === 1 ? "" : "s"}`}</strong>
              <span className="pa-muted">{day(r.at)} at {clock(r.at)} · {r.by === "you" ? "by you in the Account" : r.by === "someone" ? "from the Account" : r.by === "payment" ? "from your first payment" : `in ${productName}`}</span>
            </div>
            {r.changes.length > 0 && (
              <ul>
                {r.changes.map((c) => (
                  <li key={c.field}>
                    <span>{FIELD_LABEL[c.field] ?? c.field}</span>: <span className="pa-muted">{c.from || "empty"}</span> <Icon name="arrowRight" size={12} /> {c.to || "empty"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BusinessBillingDetailView({ productKey }: { productKey: string }) {
  return (
    <AccountShell>
      <BusinessBillingDetail productKey={productKey} />
    </AccountShell>
  );
}

function BusinessBillingDetail({ productKey }: { productKey: string }) {
  const { state, setState } = useProfiles();
  const name = state.phase === "ready" ? state.products.find((p) => p.productKey === productKey)?.name ?? null : null;
  useLeafCrumb(name);
  return (
    <Gate state={state}>
      {(s) => {
        const product = s.products.find((p) => p.productKey === productKey);
        if (!product) return <p className="pa-muted" role="status">We could not find this product. <Link href="/billing-details" className="pa-link">Back to Business &amp; Billing</Link></p>;
        return <Detail s={s} product={product} setState={setState} />;
      }}
    </Gate>
  );
}

function Detail({ s, product, setState }: { s: Extract<State, { phase: "ready" }>; product: Product; setState: (s: State) => void }) {
  const key = product.productKey;
  const saved = s.profiles.find((p) => p.productKey === key) ?? null;
  const [tab, setTab] = useState<"profile" | "history">("profile");
  const [editing, setEditing] = useState<"business" | "billing" | null>(null);
  const [draft, setDraft] = useState<Values>(() => toValues(saved, s.businessName, s.prefill));
  const [base, setBase] = useState<number | null>(saved ? saved.version : null);
  const [conflict, setConflict] = useState<ProductBillingProfileRecord | null | undefined>(undefined);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setLogoError("The logo must be a PNG, JPG or WebP image.");
    if (file.size > 4 * 1024 * 1024) return setLogoError("The logo must be 4 MB or smaller.");
    setLogoBusy(true);
    try {
      const res = await fetch(`/api/account/billing-profiles/${encodeURIComponent(key)}/logo`, { method: "POST", credentials: "same-origin", headers: { "content-type": file.type }, body: file });
      const body = (await res.json().catch(() => null)) as { status?: string; url?: string } | null;
      if (res.ok && body?.url) setDraft((d) => ({ ...d, logoUrl: body.url! }));
      else setLogoError(res.status === 415 ? "That file is not a real PNG, JPG or WebP image." : res.status === 413 ? "The logo must be 4 MB or smaller." : "We could not upload the logo. Please try again.");
    } catch {
      setLogoError("We could not upload the logo. Please try again.");
    } finally {
      setLogoBusy(false);
    }
  }

  // Order numbering is a Caterly setting: only a product that numbers its orders shows it.
  const hasNumbering = ORDER_NUMBERING_PRODUCTS.includes(key) || Boolean(saved?.orderNumberPrefix);
  const complete = isComplete(saved);
  const copyable = s.profiles.filter((p) => p.productKey !== key);
  const nameOf = (k: string) => s.products.find((p) => p.productKey === k)?.name ?? k;
  const change = (field: Field, value: string) => setDraft({ ...draft, [field]: value });
  const fieldProps = { values: draft, errors, onChange: change };
  const stateOptions = draft.state && !STATES.includes(draft.state) ? [draft.state, ...STATES] : STATES;

  const startEdit = (which: "business" | "billing") => {
    setDraft(toValues(saved, s.businessName, s.prefill));
    setErrors({});
    setNotice(null);
    setEditing(which);
  };
  const stopEdit = () => {
    setEditing(null);
    setErrors({});
    setConflict(undefined);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (editing === "business" && draft.businessPhone.replace(/\D/g, "").length <= 3) {
      setErrors({ businessPhone: "Enter the business mobile number." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const fields = { ...draft, gstin: draft.gstin.trim(), logoUrl: draft.logoUrl.trim() || null };
      const res = await fetch(`/api/account/billing-profiles/${encodeURIComponent(key)}`, { method: "PUT", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ baseVersion: base, fields, ...(editing === "business" ? { section: "business" } : {}) }) });
      const body = (await res.json().catch(() => null)) as { status?: string; profile?: ProductBillingProfileRecord; current?: ProductBillingProfileRecord | null; fields?: Errors; message?: string } | null;
      if (res.ok && body?.status === "ok" && body.profile) {
        const profile = body.profile;
        setState({ ...s, profiles: [...s.profiles.filter((p) => p.productKey !== key), profile] });
        setBase(profile.version);
        setEditing(null);
        setConflict(undefined);
        setErrors({});
        setNotice({ kind: "saved", text: "Your profile was saved. New invoices will use it." });
      } else if (res.status === 409 && body?.status === "conflict") {
        // Changed elsewhere: keep the person's edits, base the next save on what is stored now, and say so.
        const current = body.current ?? null;
        setConflict(current);
        setBase(current ? current.version : null);
        if (current) setState({ ...s, profiles: [...s.profiles.filter((p) => p.productKey !== key), current] });
      } else if (res.status === 422 && body?.fields) {
        setErrors(body.fields);
        // An error on a field this card does not show would otherwise look like a save that did nothing.
        if (editing === "business" && Object.keys(body.fields).some((k) => !["businessPhone", "orderNumberPrefix", "orderNumberNextValue", "orderNumberPadding"].includes(k))) setNotice({ kind: "failed", text: "Some details in the Billing Profile are missing or invalid. Complete the Billing Profile, then try again." });
      } else if (res.status === 403) {
        setState({ phase: "not_admin" });
      } else {
        setNotice({ kind: "failed", text: body?.message ?? "We could not save your profile. Nothing was changed. Please try again." });
      }
    } catch {
      setNotice({ kind: "failed", text: "We could not save your profile. Nothing was changed. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  const useCurrent = () => {
    if (!conflict) return;
    setDraft(toValues(conflict, s.businessName, s.prefill));
    setConflict(undefined);
  };
  const copyFrom = (from: string) => {
    const source = s.profiles.find((p) => p.productKey === from);
    if (!source) return;
    setDraft(toValues(source, s.businessName, s.prefill));
    setErrors({});
  };

  const actions = (
    <div className="pa-form-actions">
      <button type="submit" className="pa-btn pa-btn-primary" disabled={busy}>Save changes</button>
      <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={stopEdit}>Cancel</button>
    </div>
  );
  const address = [saved?.addressLine1, saved?.addressLine2, [saved?.city, saved?.state].filter(Boolean).join(", ") + (saved?.postalCode ? ` – ${saved.postalCode}` : "")].filter((x) => x && x.trim());

  return (
    <div className="pa-stack" data-testid="business-billing-detail">
      <header className="pa-card pa-bb-hero">
        <ProductTile productKey={key} name={product.name} />
        <div className="pa-bb-hero-id">
          <h1>{product.name}</h1>
          <p className="pa-muted">Business &amp; Billing Information</p>
        </div>
        <Badge tone={complete ? "success" : "warning"}>{complete ? "Complete" : "Incomplete"}</Badge>
      </header>

      <div className="pa-bb-tabs" role="tablist" aria-label="Profile sections">
        <button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? "is-active" : ""} onClick={() => setTab("profile")}><Icon name="building" size={16} /> Business &amp; Billing</button>
        <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}><Icon name="history" size={16} /> Change History</button>
      </div>

      {conflict !== undefined && (
        <div className="pa-card" role="alert" data-testid="bd-conflict">
          <p>
            {conflict
              ? `This profile was changed elsewhere (in the Account or in ${product.name}) on ${day(conflict.updatedAt)} at ${clock(conflict.updatedAt)}. Your edits are still here and nothing was lost.`
              : "This profile was changed elsewhere. Your edits are still here and nothing was lost."}{" "}
            Review them, then press Save changes again to keep yours{conflict ? ", or use the new values." : "."}
          </p>
          {conflict && <button type="button" className="pa-btn pa-btn-outline" onClick={useCurrent}>Use the new values</button>}
        </div>
      )}
      {notice && <p className="pa-muted" role={notice.kind === "failed" ? "alert" : "status"}>{notice.text}</p>}

      {tab === "history" ? (
        <History productKey={key} productName={product.name} version={saved?.version ?? null} />
      ) : (
        <>
          <section className="pa-card pa-bb-card" aria-labelledby="bb-business-title">
            <div className="pa-bb-card-head">
              {saved?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the logo is a link kept in Ops
                <img className="pa-bb-logo" src={saved.logoUrl} alt={`${product.name} logo`} width={48} height={48} />
              ) : (
                <span className="pa-detail-tile"><Icon name="home" size={22} /></span>
              )}
              <div>
                <h2 id="bb-business-title">Business Profile</h2>
                <p className="pa-muted">Information used to identify and represent your business in {product.name}.</p>
              </div>
              {editing !== "business" && <button type="button" className="pa-btn pa-btn-outline" onClick={() => startEdit("business")} disabled={editing === "billing"}><Icon name="pencil" size={14} /> Edit</button>}
            </div>
            {editing === "business" ? (
              <form className="pa-form" onSubmit={save} noValidate aria-label="Edit business profile">
                <div className="pa-bd-grid">
                  <div className="pa-field pa-span-6">
                    <span id="bd-logo-label">Logo <span className="pa-optional">(Optional)</span></span>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-labelledby="bd-logo-label"
                      className={`pa-dropzone${dragging ? " is-over" : ""}${logoError ? " is-error" : ""}`}
                      onClick={() => logoInput.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          logoInput.current?.click();
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        void pickLogo(e.dataTransfer.files?.[0]);
                      }}
                    >
                      {draft.logoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- the logo is a link kept in Ops */}
                          <img className="pa-dropzone-preview" src={draft.logoUrl} alt="Logo preview" width={80} height={80} />
                          <span className="pa-dropzone-link">Click to change image</span>
                        </>
                      ) : (
                        <>
                          <Icon name="uploadCloud" size={32} />
                          <span className="pa-dropzone-title">{logoBusy ? "Uploading…" : "Click to upload image"}</span>
                          <span className="pa-hint">or drag and drop</span>
                          <span className="pa-hint">PNG, JPG or WebP, up to 4MB</span>
                        </>
                      )}
                      <input ref={logoInput} id="bd-logo" aria-label="Logo" type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={logoBusy} onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                    {draft.logoUrl && <button type="button" className="pa-dropzone-remove" onClick={() => change("logoUrl", "")}>Remove image</button>}
                    {logoError && <span className="pa-hint" role="alert">{logoError}</span>}
                  </div>
                  <Input {...fieldProps} id="brandName" label="Brand name" optional span={6} maxLength={120} autoComplete="off" hint="Shown to customers. The business name (under Billing Profile) is used on invoices." />
                  <div className="pa-field pa-span-6">
                    <label htmlFor="bd-description">Description <span className="pa-optional">(Optional)</span></label>
                    <textarea id="bd-description" rows={3} value={draft.description} maxLength={2000} onChange={(e) => change("description", e.target.value)} />
                  </div>
                  <div className="pa-field pa-span-6">
                    <label htmlFor="bd-businessPhone">Mobile number <span className="pa-required" aria-hidden="true">*</span></label>
                    <PhoneField id="bd-businessPhone" value={draft.businessPhone} onChange={(v) => change("businessPhone", v)} describedBy={errors.businessPhone ? "bd-businessPhone-err" : undefined} invalid={!!errors.businessPhone} />
                    {errors.businessPhone && <span className="pa-hint" id="bd-businessPhone-err" role="alert">{errors.businessPhone}</span>}
                  </div>
                  <Input {...fieldProps} id="website" label="Website" optional span={2} maxLength={300} type="url" autoComplete="url" hint="Starts with https://" />
                  <Input {...fieldProps} id="instagram" label="Instagram" optional span={2} maxLength={300} type="url" autoComplete="off" hint="Link to your page" />
                  <Input {...fieldProps} id="facebook" label="Facebook" optional span={2} maxLength={300} type="url" autoComplete="off" hint="Link to your page" />
                  {hasNumbering && (
                    <>
                      <h3 className="pa-span-6 pa-bd-subhead">Order numbering</h3>
                      <Input {...fieldProps} id="orderNumberPrefix" label="Prefix" span={2} maxLength={10} autoComplete="off" hint="Letters, numbers or dashes, e.g. ORD" />
                      <Input {...fieldProps} id="orderNumberNextValue" label="Starting number" span={2} maxLength={9} autoComplete="off" hint="The next order gets this number. From here it can only be raised." />
                      <Input {...fieldProps} id="orderNumberPadding" label="Digits" span={2} maxLength={2} autoComplete="off" hint="1 to 10, e.g. 4 gives ORD-0001" />
                    </>
                  )}
                </div>
                {actions}
              </form>
            ) : (
              <dl className="pa-bb-grid">
                <Item label="Brand Name">{dash(saved?.brandName)}</Item>
                <Item label="Business Description" wide>{dash(saved?.description)}</Item>
                <Item label="Website">
                  {saved?.website ? <a className="pa-link" href={saved.website} target="_blank" rel="noopener noreferrer">{host(saved.website)} <Icon name="arrowUpRight" size={14} /></a> : dash(null)}
                </Item>
                <Item label="Mobile Number">{dash(saved?.businessPhone)}</Item>
                <Item label="Instagram">
                  {saved?.instagram ? <a className="pa-link" href={saved.instagram} target="_blank" rel="noopener noreferrer">{host(saved.instagram)} <Icon name="arrowUpRight" size={14} /></a> : dash(null)}
                </Item>
                <Item label="Facebook">
                  {saved?.facebook ? <a className="pa-link" href={saved.facebook} target="_blank" rel="noopener noreferrer">{host(saved.facebook)} <Icon name="arrowUpRight" size={14} /></a> : dash(null)}
                </Item>
                {hasNumbering && (
                  <>
                    <Item label="Order Prefix">{dash(saved?.orderNumberPrefix)}</Item>
                    <Item label="Starting Number">{dash(saved?.orderNumberNextValue)}</Item>
                    <Item label="Digits">{dash(saved?.orderNumberPadding)}</Item>
                    <Item label="Next Order Number">{saved?.orderNumberPrefix && saved.orderNumberNextValue && saved.orderNumberPadding ? `${saved.orderNumberPrefix}-${saved.orderNumberNextValue.padStart(Number(saved.orderNumberPadding), "0")}` : dash(null)}</Item>
                  </>
                )}
              </dl>
            )}
          </section>

          <section className="pa-card pa-bb-card" aria-labelledby="bb-billing-title">
            <div className="pa-bb-card-head">
              <span className="pa-detail-tile"><Icon name="receipt" size={22} /></span>
              <div>
                <h2 id="bb-billing-title">Billing Profile</h2>
                <p className="pa-muted">The business name, tax number, address and billing contact used for subscriptions and invoices.</p>
              </div>
              {editing !== "billing" && <button type="button" className="pa-btn pa-btn-outline" onClick={() => startEdit("billing")} disabled={editing === "business"}><Icon name="pencil" size={14} /> Edit</button>}
            </div>
            {editing === "billing" ? (
              <form className="pa-form" onSubmit={save} noValidate aria-label="Edit billing profile">
                {copyable.length > 0 && (
                  <div className="pa-field pa-span-6">
                    <label htmlFor="bd-copy">Copy from another product</label>
                    <span className="pa-select">
                      <select id="bd-copy" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)}>
                        <option value="">Choose a product to copy from</option>
                        {copyable.map((p) => <option key={p.productKey} value={p.productKey}>{nameOf(p.productKey)}</option>)}
                      </select>
                      <Icon name="chevronDown" size={16} />
                    </span>
                    <span className="pa-hint">This fills the form once with that product&apos;s details. Nothing is saved until you press Save changes.</span>
                  </div>
                )}
                <div className="pa-bd-grid">
                  <Input {...fieldProps} id="name" label="Business name" span={3} maxLength={120} autoComplete="organization" />
                  <Input {...fieldProps} id="gstin" label="GSTIN" optional span={3} maxLength={15} autoComplete="off" />
                  <Input {...fieldProps} id="contactName" label="Billing contact person" span={3} maxLength={120} autoComplete="name" />
                  <Input {...fieldProps} id="contactEmail" label="Billing email" span={3} maxLength={160} type="email" autoComplete="email" />
                  <div className="pa-field pa-span-6">
                    <label htmlFor="bd-contactPhone">Billing phone number <span className="pa-required" aria-hidden="true">*</span></label>
                    <PhoneField id="bd-contactPhone" value={draft.contactPhone} onChange={(v) => change("contactPhone", v)} describedBy={errors.contactPhone ? "bd-contactPhone-err" : undefined} invalid={!!errors.contactPhone} />
                    {errors.contactPhone && <span className="pa-hint" id="bd-contactPhone-err" role="alert">{errors.contactPhone}</span>}
                  </div>
                  <h3 className="pa-span-6 pa-bd-subhead">Billing address</h3>
                  <Input {...fieldProps} id="addressLine1" label="Address line 1" span={6} maxLength={200} autoComplete="address-line1" />
                  <Input {...fieldProps} id="addressLine2" label="Address line 2" optional span={6} maxLength={200} autoComplete="address-line2" />
                  <Input {...fieldProps} id="city" label="City" span={2} maxLength={80} autoComplete="address-level2" />
                  <div className="pa-field pa-span-2">
                    <label htmlFor="bd-state">State <span className="pa-required" aria-hidden="true">*</span></label>
                    <span className="pa-select">
                      <select id="bd-state" value={draft.state} aria-required="true" aria-invalid={errors.state ? true : undefined} aria-describedby={errors.state ? "bd-state-err" : undefined} autoComplete="address-level1" onChange={(e) => change("state", e.target.value)}>
                        <option value="">Select state</option>
                        {stateOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <Icon name="chevronDown" size={16} />
                    </span>
                    {errors.state && <span className="pa-hint" id="bd-state-err" role="alert">{errors.state}</span>}
                  </div>
                  <Input {...fieldProps} id="postalCode" label="PIN code" span={2} maxLength={6} autoComplete="postal-code" />
                  <div className="pa-field pa-span-3">
                    <label htmlFor="bd-country">Country <span className="pa-required" aria-hidden="true">*</span></label>
                    <span className="pa-select">
                      <select id="bd-country" value={draft.country} aria-required="true" aria-invalid={errors.country ? true : undefined} autoComplete="country-name" onChange={(e) => change("country", e.target.value)}>
                        <option value={COUNTRY}>{COUNTRY}</option>
                      </select>
                      <Icon name="chevronDown" size={16} />
                    </span>
                    {errors.country && <span className="pa-hint" role="alert">{errors.country}</span>}
                  </div>
                </div>
                {!saved && s.prefill && <p className="pa-hint">The billing contact starts as your own details from sign-up. Save to keep it.</p>}
                {actions}
              </form>
            ) : (
              <dl className="pa-bb-grid">
                <Item label="Business Name">{dash(saved?.name)}</Item>
                <Item label="GSTIN">{dash(saved?.gstin)}</Item>
                <Item label="Billing Address" wide>{address.length ? address.map((line) => <span key={line} className="pa-bb-line">{line}</span>) : dash(null)}</Item>
                <Item label="Billing Contact">{dash(saved?.contactName)}</Item>
                <Item label="Billing Email">{dash(saved?.contactEmail)}</Item>
                <Item label="Billing Phone">{dash(saved?.contactPhone)}</Item>
              </dl>
            )}
          </section>

          <aside className="pa-card pa-bb-rule" aria-label="Invoice update rule">
            <Icon name="helpCircle" size={22} />
            <div>
              <h3>Invoice update rule</h3>
              <p className="pa-muted">Changes to GSTIN, business name or billing address will apply to future invoices only. Previously issued invoices will remain unchanged.</p>
            </div>
          </aside>
        </>
      )}
      {saved && <p className="pa-hint">Last changed on {day(saved.updatedAt)} in {saved.source === "product" ? product.name : "the Account"}.</p>}
    </div>
  );
}


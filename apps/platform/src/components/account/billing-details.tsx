"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Buyer } from "@platterly/contract";
import { Icon } from "./icons";
import { PhoneField } from "../phone-field";

type Field = "name" | "contactName" | "contactEmail" | "contactPhone" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country" | "gstin";
type Errors = Partial<Record<Field, string>>;
type Prefill = { contactName: string; contactEmail: string; contactPhone: string } | null;
type Loaded = { businessName: string; buyer: Buyer | null; updatedAt: string | null; prefill?: Prefill };
type State = { phase: "loading" } | { phase: "error" } | { phase: "no_business" } | { phase: "not_admin" } | ({ phase: "ready" } & Loaded);

const STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
// Platterly bills in India only for now, so India is the one country; GST invoices need an Indian state.
const COUNTRY = "India";

type Values = Record<Field, string>;
const toValues = (b: Buyer | null, businessName: string, prefill?: Prefill): Values => ({
  name: b?.name || businessName,
  // Until the Admin saves a billing contact, it starts as the person's own details from sign-up.
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
});
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

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

/** The Account's Billing Details page: the business and billing contact details on invoices and official messages. Only the business's Admin can open or change it. */
export function BillingDetails() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ kind: "saved" | "failed"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/billing-profile", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (res.status === 401) return window.location.replace("/auth/start?next=%2Fbilling-details");
        const body = (await res.json().catch(() => null)) as (Loaded & { status?: string }) | null;
        if (!alive) return;
        if (res.status === 409) return setState({ phase: "no_business" });
        if (res.status === 403) return setState({ phase: "not_admin" });
        if (res.ok && body?.status === "ok") {
          setState({ phase: "ready", businessName: body.businessName, buyer: body.buyer, updatedAt: body.updatedAt, prefill: body.prefill ?? null });
          setDraft(toValues(body.buyer, body.businessName, body.prefill));
        } else setState({ phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "loading" || (state.phase === "ready" && !draft)) return <p className="pa-muted" role="status" aria-busy="true">Loading your billing details…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load your billing details just now. Please reload the page in a few minutes.</p>;
  if (state.phase === "no_business") return <p className="pa-muted" role="status">You have not set up a business yet, so there are no billing details to show.</p>;
  if (state.phase === "not_admin") return <p className="pa-muted" role="status">Billing details are available to the business Admin only.</p>;

  const values = draft!;
  const change = (key: Field, value: string) => setDraft({ ...values, [key]: value });
  const fieldProps = { values, errors, onChange: change };
  const stateOptions = values.state && !STATES.includes(values.state) ? [values.state, ...STATES] : STATES;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (state.phase !== "ready") return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/account/billing-profile", { method: "PUT", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ...values, gstin: values.gstin.trim() }) });
      const body = (await res.json().catch(() => null)) as (Loaded & { status?: string; fields?: Errors; message?: string }) | null;
      if (res.ok && body?.status === "ok") {
        setState({ phase: "ready", businessName: body.businessName, buyer: body.buyer, updatedAt: body.updatedAt, prefill: state.prefill ?? null });
        setDraft(toValues(body.buyer, body.businessName, state.prefill));
        setErrors({});
        setNotice({ kind: "saved", text: "Your billing details were saved. New invoices will use them." });
      } else if (res.status === 422 && body?.fields) {
        setErrors(body.fields);
      } else if (res.status === 403) {
        setState({ phase: "not_admin" });
      } else {
        setNotice({ kind: "failed", text: body?.message ?? "We could not save your billing details. Nothing was changed. Please try again." });
      }
    } catch {
      setNotice({ kind: "failed", text: "We could not save your billing details. Nothing was changed. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  const cancel = () => {
    if (state.phase !== "ready") return;
    setDraft(toValues(state.buyer, state.businessName, state.prefill));
    setErrors({});
    setNotice(null);
  };

  return (
    <div className="pa-detail-grid" data-testid="billing-details">
      <form className="pa-card pa-form" aria-labelledby="bd-title" onSubmit={save} noValidate>
        <h2 id="bd-title">Business billing information</h2>
        {notice && (
          <p className="pa-muted" role={notice.kind === "failed" ? "alert" : "status"}>
            {notice.text}
          </p>
        )}
        <div className="pa-bd-grid">
          <Input {...fieldProps} id="name" label="Business / Organisation name" span={6} maxLength={120} autoComplete="organization" />
          <Input {...fieldProps} id="contactName" label="Billing contact person" span={3} maxLength={120} autoComplete="name" />
          <Input {...fieldProps} id="contactEmail" label="Billing email" span={3} maxLength={160} type="email" autoComplete="email" />
          <div className="pa-field pa-span-6">
            <label htmlFor="bd-contactPhone">Billing phone number <span className="pa-required" aria-hidden="true">*</span></label>
            <PhoneField id="bd-contactPhone" value={values.contactPhone} onChange={(v) => change("contactPhone", v)} describedBy={errors.contactPhone ? "bd-contactPhone-err" : undefined} invalid={!!errors.contactPhone} />
            {errors.contactPhone && <span className="pa-hint" id="bd-contactPhone-err" role="alert">{errors.contactPhone}</span>}
          </div>
          <h3 className="pa-span-6 pa-bd-subhead">Billing address</h3>
          <Input {...fieldProps} id="addressLine1" label="Address line 1" span={6} maxLength={200} autoComplete="address-line1" />
          <Input {...fieldProps} id="addressLine2" label="Address line 2" optional span={6} maxLength={200} autoComplete="address-line2" />
          <Input {...fieldProps} id="city" label="City" span={2} maxLength={80} autoComplete="address-level2" />
          <div className="pa-field pa-span-2">
            <label htmlFor="bd-state">State <span className="pa-required" aria-hidden="true">*</span></label>
            <span className="pa-select">
              <select id="bd-state" value={values.state} aria-required="true" aria-invalid={errors.state ? true : undefined} aria-describedby={errors.state ? "bd-state-err" : undefined} autoComplete="address-level1" onChange={(e) => change("state", e.target.value)}>
                <option value="">Select state</option>
                {stateOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <Icon name="chevronDown" size={16} />
            </span>
            {errors.state && <span className="pa-hint" id="bd-state-err" role="alert">{errors.state}</span>}
          </div>
          <Input {...fieldProps} id="postalCode" label="PIN code" span={2} maxLength={6} autoComplete="postal-code" />
          <div className="pa-field pa-span-3">
            <label htmlFor="bd-country">Country <span className="pa-required" aria-hidden="true">*</span></label>
            <span className="pa-select">
              <select id="bd-country" value={values.country} aria-required="true" aria-invalid={errors.country ? true : undefined} autoComplete="country-name" onChange={(e) => change("country", e.target.value)}>
                <option value={COUNTRY}>{COUNTRY}</option>
              </select>
              <Icon name="chevronDown" size={16} />
            </span>
            {errors.country && <span className="pa-hint" role="alert">{errors.country}</span>}
          </div>
          <Input {...fieldProps} id="gstin" label="GSTIN" optional span={3} maxLength={15} autoComplete="off" />
        </div>
        <p className="pa-hint">
          {!state.buyer?.contactEmail && state.prefill ? "The billing contact starts as your own details from sign-up. Save to keep it. " : ""}
          {state.buyer && state.updatedAt ? `Last changed on ${day(state.updatedAt)}. ` : ""}Invoices already issued are never changed.
        </p>
        <div className="pa-form-actions">
          <button type="submit" className="pa-btn pa-btn-primary" disabled={busy}>
            Save changes
          </button>
          <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      </form>

      <div className="pa-stack pa-detail-side">
        <section className="pa-card" aria-label="About billing details">
          <div className="pa-bd-side-head">
            <span className="pa-detail-tile"><Icon name="receipt" size={22} /></span>
            <h2>About billing details</h2>
          </div>
          <p>This information is used to:</p>
          <ul className="pa-bd-checks">
            <li><Icon name="check" size={18} /> Generate your subscription invoices</li>
            <li><Icon name="check" size={18} /> Include correct business and tax details (e.g. GSTIN)</li>
            <li><Icon name="check" size={18} /> Send important billing and payment communications</li>
          </ul>
        </section>
        <section className="pa-card pa-bd-secure" aria-label="Your information is secure">
          <div className="pa-bd-side-head">
            <span className="pa-detail-tile pa-bd-secure-tile"><Icon name="shield" size={22} /></span>
            <h2>Your information is secure</h2>
          </div>
          <p className="pa-hint">Your billing information is stored securely and used only for billing and compliance purposes.</p>
        </section>
      </div>
    </div>
  );
}

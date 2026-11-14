"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Buyer } from "@platterly/contract";
import { Icon } from "./icons";

type Field = "name" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "gstin";
type Errors = Partial<Record<Field, string>>;
type Loaded = { businessName: string; buyer: Buyer | null; updatedAt: string | null };
type State = { phase: "loading" } | { phase: "error" } | { phase: "no_business" } | { phase: "not_admin" } | ({ phase: "ready" } & Loaded);

const EMPTY: Buyer = { name: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: null, gstin: "" };
const FIELDS: { key: Field; label: string; autoComplete: string; hint?: string; maxLength: number }[] = [
  { key: "name", label: "Business name", autoComplete: "organization", maxLength: 120 },
  { key: "addressLine1", label: "Address line 1", autoComplete: "address-line1", maxLength: 200 },
  { key: "addressLine2", label: "Address line 2 (optional)", autoComplete: "address-line2", maxLength: 200 },
  { key: "city", label: "City", autoComplete: "address-level2", maxLength: 80 },
  { key: "state", label: "State", autoComplete: "address-level1", maxLength: 80 },
  { key: "postalCode", label: "PIN code", autoComplete: "postal-code", maxLength: 6 },
  { key: "gstin", label: "GSTIN (optional)", autoComplete: "off", hint: "15 characters. Add it for a GST invoice in your business name.", maxLength: 15 },
];
const shown = (b: Buyer | null): Buyer => ({ ...EMPTY, ...(b ?? {}), addressLine1: b?.addressLine1 ?? "", addressLine2: b?.addressLine2 ?? "", city: b?.city ?? "", state: b?.state ?? "", postalCode: b?.postalCode ?? "", gstin: b?.gstin ?? "" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The Account's Billing details page: what starts every Store purchase filled in and what a new invoice is made from. Only the business's Admin can open or change it. */
export function BillingDetails() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Buyer>(EMPTY);
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
        setState(res.ok && body?.status === "ok" ? { phase: "ready", businessName: body.businessName, buyer: body.buyer, updatedAt: body.updatedAt } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "loading") return <p className="pa-muted" role="status" aria-busy="true">Loading your billing details…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load your billing details just now. Please reload the page in a few minutes.</p>;
  if (state.phase === "no_business") return <p className="pa-muted" role="status">You have not set up a business yet, so there are no billing details to show.</p>;
  if (state.phase === "not_admin") return <p className="pa-muted" role="status">Billing details are available to the business Admin only.</p>;

  const current = shown(state.buyer);
  const startEdit = () => {
    setDraft(current.name ? current : { ...current, name: state.businessName });
    setErrors({});
    setNotice(null);
    setEditing(true);
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/account/billing-profile", { method: "PUT", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(draft) });
      const body = (await res.json().catch(() => null)) as (Loaded & { status?: string; fields?: Errors; message?: string }) | null;
      if (res.ok && body?.status === "ok") {
        setState({ phase: "ready", businessName: body.businessName, buyer: body.buyer, updatedAt: body.updatedAt });
        setErrors({});
        setEditing(false);
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

  const values = editing ? draft : current;
  return (
    <form className="pa-card pa-form" aria-labelledby="bd-title" onSubmit={save} noValidate>
      <div className="pa-section-head">
        <h2 id="bd-title">{state.businessName}</h2>
        {!editing && (
          <button type="button" className="pa-btn pa-btn-outline" onClick={startEdit}>
            <Icon name="pencil" size={15} /> Edit
          </button>
        )}
      </div>
      <p className="pa-hint">
        {state.buyer ? `These details start every Store purchase filled in and are printed on new invoices. Last changed on ${day(state.updatedAt!)}.` : "Nothing is saved yet. Add your details here, or they are saved from your first payment."} Invoices already issued are never changed.
      </p>
      {notice && (
        <p className="pa-muted" role={notice.kind === "failed" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      <div className="pa-form-grid">
        {FIELDS.map((f) => {
          const id = `bd-${f.key}`;
          const error = errors[f.key];
          return (
            <div className="pa-field" key={f.key}>
              <label htmlFor={id}>{f.label}</label>
              <input id={id} value={(values[f.key as keyof Buyer] as string | null) ?? ""} placeholder="Not set" disabled={!editing} readOnly={!editing} maxLength={f.maxLength} autoComplete={f.autoComplete} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              {error ? (
                <span className="pa-hint" id={`${id}-err`} role="alert">
                  {error}
                </span>
              ) : f.hint ? (
                <span className="pa-hint">{f.hint}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {editing && (
        <div className="pa-form-actions">
          <button type="submit" className="pa-btn pa-btn-primary" disabled={busy}>
            Save changes
          </button>
          <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

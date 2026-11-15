"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./icons";

const MESSAGES: Record<string, string> = {
  wrong_password: "That is not your current password.",
  no_password: "This account has no password to confirm with.",
  too_many_attempts: "Too many wrong attempts. Please wait a few minutes and try again.",
  has_business: "You still have a business on this account. Hand it over or close it first, then ask again.",
  already_pending: "A deletion request is already waiting.",
};
const REQUIRED_PHRASE = "DELETE";
const GENERIC = "Something went wrong. Nothing was changed. Please try again.";
type Deletion = { phase: "loading" } | { phase: "none" } | { phase: "pending"; requestedAt: string };

/** "Your data": download everything the central identity holds about you, and ask for the account to be deleted. Both ask for the current password. */
export function DataRights() {
  const [panel, setPanel] = useState<"" | "export" | "delete">("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [deletion, setDeletion] = useState<Deletion>({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/account/deletion", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((b: { status?: string; requestedAt?: string }) => alive && setDeletion(b.status === "pending" && b.requestedAt ? { phase: "pending", requestedAt: b.requestedAt } : { phase: "none" }))
      .catch(() => alive && setDeletion({ phase: "none" }));
    return () => {
      alive = false;
    };
  }, []);

  function open(next: "export" | "delete") {
    setPanel(next);
    setPassword("");
    setReason("");
    setTyped("");
    setError("");
    setNote("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(panel === "export" ? "/api/account/export" : "/api/account/deletion", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ password, reason }) });
      if (res.status === 401) return void window.location.replace("/auth/start?next=%2Fprofile");
      if (res.ok && panel === "export") {
        const url = URL.createObjectURL(await res.blob());
        const link = Object.assign(document.createElement("a"), { href: url, download: "platterly-my-data.json" });
        link.click();
        URL.revokeObjectURL(url);
        setPanel("");
        setNote("Your data was downloaded.");
      } else if (res.ok) {
        setPanel("");
        setDeletion({ phase: "pending", requestedAt: new Date().toISOString() });
        setNote("We received your request. Our team will contact you before anything is deleted.");
      } else {
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        setError((body?.status && MESSAGES[body.status]) || GENERIC);
      }
    } catch {
      setError(GENERIC);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/deletion", { method: "DELETE", credentials: "same-origin" });
      if (res.ok) {
        setDeletion({ phase: "none" });
        setNote("Your deletion request was withdrawn.");
      } else setError(GENERIC);
    } finally {
      setBusy(false);
    }
  }

  const closeDelete = () => {
    if (!busy) setPanel("");
  };
  return (
    <>
      <section className="pa-card pa-form" aria-labelledby="pf-data">
        <div className="pa-section-head">
          <h2 id="pf-data">
            <Icon name="database" size={20} /> Your Data
          </h2>
        </div>
        {note && (
          <p className="pa-muted" role="status">
            {note}
          </p>
        )}
        <div className="pa-switch-row">
          <span className="pa-data-icon"><Icon name="download" size={24} /></span>
          <div>
            <span className="pa-row-label">Download my data</span>
            <span className="pa-hint">A file with what Platterly&apos;s sign-in holds about you. Data inside a product, such as Caterly&apos;s orders, is not included.</span>
          </div>
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("export")}>
            Download
          </button>
        </div>
        {panel === "export" && (
          <form className="pa-form" onSubmit={submit} noValidate>
            <div className="pa-form-grid">
              <div className="pa-field">
                <label htmlFor="dr-password">Current password</label>
                <input id="dr-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <span className="pa-hint">We ask again before giving you your data.</span>
              </div>
            </div>
            {error && (
              <p className="pa-muted" role="alert">
                {error}
              </p>
            )}
            <div className="pa-form-actions">
              <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !password}>
                Download my data
              </button>
              <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setPanel("")}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* The same shape as Caterly's Danger Zone: a card, a red box inside it, and a dialog that asks for the word DELETE before the button works. */}
      <section className="pa-card pa-form" aria-labelledby="pf-danger">
        <div className="pa-section-head">
          <h2 id="pf-danger">Danger Zone</h2>
        </div>
        <p className="pa-hint">Irreversible actions. Proceed with care.</p>
        <div className="pa-danger-box">
          <h3>Delete my account</h3>
          {deletion.phase === "pending" ? (
            <p className="pa-hint" role="status">
              Deletion requested on {new Date(deletion.requestedAt).toLocaleDateString()}. Our team will contact you before anything is deleted.
            </p>
          ) : (
            <p className="pa-hint">Asks us to permanently delete your Platterly account and sign-in. Our team reviews every request. You must hand over or close your business first.</p>
          )}
          <div>
            {deletion.phase === "pending" ? (
              <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={withdraw}>
                Withdraw request
              </button>
            ) : (
              <button type="button" className="pa-btn pa-btn-danger" disabled={deletion.phase === "loading"} onClick={() => open("delete")}>
                Request deletion
              </button>
            )}
          </div>
        </div>
      </section>

      {panel === "delete" && (
        <div className="pa-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeDelete()}>
          <form className="pa-modal pa-modal-narrow" role="alertdialog" aria-modal="true" aria-labelledby="dr-title" aria-describedby="dr-desc" onSubmit={submit} noValidate onKeyDown={(e) => e.key === "Escape" && closeDelete()}>
            <div className="pa-modal-head">
              <h2 id="dr-title">Delete your account?</h2>
            </div>
            <p id="dr-desc" className="pa-muted">
              This asks us to permanently delete your Platterly account and sign-in, and everything you use it for. Our team reviews the request and contacts you before anything is
              deleted. You must hand over or close your business first. This cannot be undone once it is done.
            </p>
            <div className="pa-field">
              <label htmlFor="dr-confirm">
                Type <span className="pa-mono">{REQUIRED_PHRASE}</span> to confirm
              </label>
              <input id="dr-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
            </div>
            <div className="pa-field">
              <label htmlFor="dr-password">Current password</label>
              <input id="dr-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="pa-hint">We ask again before taking a deletion request.</span>
            </div>
            <div className="pa-field">
              <label htmlFor="dr-reason">Reason (optional)</label>
              <input id="dr-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error && (
              <p className="pa-muted pa-danger-text" role="alert">
                {error}
              </p>
            )}
            <div className="pa-form-actions pa-modal-actions">
              <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={closeDelete}>
                Cancel
              </button>
              <button type="submit" className="pa-btn pa-btn-danger" disabled={busy || typed !== REQUIRED_PHRASE || !password}>
                {busy ? "Sending…" : "Request deletion"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

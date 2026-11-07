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

  return (
    <section className="pa-card pa-form" aria-labelledby="pf-data">
      <div className="pa-section-head">
        <h2 id="pf-data">
          <Icon name="shield" size={16} /> Your data
        </h2>
      </div>
      {note && (
        <p className="pa-muted" role="status">
          {note}
        </p>
      )}
      <div className="pa-switch-row">
        <div>
          <span className="pa-row-label">Download my data</span>
          <span className="pa-hint">A file with what Platterly&apos;s sign-in holds about you. Data inside a product, such as Caterly&apos;s orders, is not included.</span>
        </div>
        <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("export")}>
          Download
        </button>
      </div>
      <div className="pa-switch-row">
        <div>
          <span className="pa-row-label">Delete my account</span>
          {deletion.phase === "pending" ? (
            <span className="pa-hint" role="status">
              Deletion requested on {new Date(deletion.requestedAt).toLocaleDateString()}. Our team will contact you before anything is deleted.
            </span>
          ) : (
            <span className="pa-hint">Ask us to delete your account. Our team reviews every request. You must hand over or close your business first.</span>
          )}
        </div>
        {deletion.phase === "pending" ? (
          <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={withdraw}>
            Withdraw request
          </button>
        ) : (
          <button type="button" className="pa-btn pa-btn-outline" disabled={deletion.phase === "loading"} onClick={() => open("delete")}>
            Request deletion
          </button>
        )}
      </div>
      {panel && (
        <form className="pa-form" onSubmit={submit} noValidate>
          <div className="pa-form-grid">
            <div className="pa-field">
              <label htmlFor="dr-password">Current password</label>
              <input id="dr-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="pa-hint">We ask again before {panel === "export" ? "giving you your data" : "taking a deletion request"}.</span>
            </div>
            {panel === "delete" && (
              <div className="pa-field">
                <label htmlFor="dr-reason">Reason (optional)</label>
                <input id="dr-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
          </div>
          {error && (
            <p className="pa-muted" role="alert">
              {error}
            </p>
          )}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !password}>
              {panel === "export" ? "Download my data" : "Send deletion request"}
            </button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setPanel("")}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

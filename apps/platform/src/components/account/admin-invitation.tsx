"use client";

import { useEffect, useState } from "react";

const MESSAGES: Record<string, string> = {
  transfer_not_pending: "This invitation has already been answered or withdrawn.",
  transfer_expired: "This invitation has expired. Ask the current Admin to send a new one.",
  nominee_email_mismatch: "This invitation was sent to a different email address. Sign in with the address it was sent to.",
  nominee_holds_a_slot: "You already belong to a business or use a Platterly product, so you cannot take over as Business Admin.",
  ownership_locked: "This business cannot change its Admin right now. Please contact Platterly support.",
  organisation_not_active: "This business is not active, so its Admin cannot change.",
  email_change_open: "The current Admin changed their sign-in email recently. Please try again tomorrow.",
  account_on_hold: "The business account is under review. Please try again later.",
  admin_mismatch: "The business's Admin changed since this invitation was sent. Ask for a new invitation.",
  not_the_admin: "The business's Admin changed since this invitation was sent. Ask for a new invitation.",
};
const GENERIC = "Something went wrong. Nothing was changed. Please try again.";
type View = { phase: "loading" } | { phase: "signed_out" } | { phase: "not_for_you" } | { phase: "closed"; why: string } | { phase: "pending"; businessName: string; expiresAt: string } | { phase: "done"; text: string } | { phase: "error" };

/** The page the invitation email opens: sign in or create an account, then accept or decline the Business Admin role. */
export function AdminInvitation({ token }: { token: string }) {
  const [view, setView] = useState<View>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/account/admin-transfer/invitation?token=${encodeURIComponent(token)}`, { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (res.status === 401) return setView({ phase: "signed_out" });
        const body = (await res.json()) as { status: string; businessName?: string; expiresAt?: string };
        if (body.status === "pending") setView({ phase: "pending", businessName: body.businessName ?? "", expiresAt: body.expiresAt ?? "" });
        else if (body.status === "not_for_you") setView({ phase: "not_for_you" });
        else if (body.status === "error") setView({ phase: "error" });
        else setView({ phase: "closed", why: body.status });
      } catch {
        if (alive) setView({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function answer(action: "accept" | "decline") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/admin-transfer/invitation", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action, token }) });
      const body = (await res.json().catch(() => ({}))) as { status?: string; businessName?: string };
      if (res.ok) setView({ phase: "done", text: action === "accept" ? `You are now the Business Admin of ${body.businessName ?? "the business"}. Open your product to carry on.` : "You declined the invitation. The current Admin has been told." });
      else setError(MESSAGES[body.status ?? ""] ?? GENERIC);
    } catch {
      setError(GENERIC);
    }
    setBusy(false);
  }

  const authHost = typeof window === "undefined" ? "" : `${window.location.protocol}//${window.location.host.replace(/^account\./, "auth.")}`;
  const here = `/admin-transfer?invite=${encodeURIComponent(token)}`;
  return (
    <section className="pa-card pa-form" aria-labelledby="ai-title">
      <div className="pa-section-head"><h2 id="ai-title">Business Admin invitation</h2></div>
      {view.phase === "loading" && <p className="pa-muted">Loading…</p>}
      {view.phase === "error" && <p className="pa-muted" role="alert">We could not load this invitation. Please try again.</p>}
      {view.phase === "signed_out" && (
        <>
          <p className="pa-muted">You were invited to become a Business Admin on Platterly. Sign in with the email address the invitation was sent to, or create an account with it.</p>
          <div className="pa-form-actions">
            <a className="pa-btn pa-btn-primary" href={`/auth/start?next=${encodeURIComponent(here)}`}>Sign in</a>
            <a className="pa-btn pa-btn-outline" href={`${authHost}/sign-up?invite=${encodeURIComponent(token)}`}>Create an account</a>
          </div>
        </>
      )}
      {view.phase === "not_for_you" && <p className="pa-muted" role="status">This invitation is not for the account you are signed in with, or it no longer exists. Sign in with the email address it was sent to.</p>}
      {view.phase === "closed" && <p className="pa-muted" role="status">{view.why === "expired" ? MESSAGES.transfer_expired : MESSAGES.transfer_not_pending}</p>}
      {view.phase === "pending" && (
        <>
          <p>You were invited to become the Business Admin of <strong>{view.businessName}</strong>.</p>
          <p className="pa-muted">The Business Admin owns the business account: its plan, billing and who looks after it. The current Admin stays on as a member who can see everything but cannot change anything, until you remove them. The invitation ends on {new Date(view.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}.</p>
          {error && <p className="pa-muted" role="alert">{error}</p>}
          <div className="pa-form-actions">
            <button type="button" className="pa-btn pa-btn-primary" disabled={busy} onClick={() => void answer("accept")}>Accept and become the Business Admin</button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => void answer("decline")}>Decline</button>
          </div>
        </>
      )}
      {view.phase === "done" && <p role="status">{view.text}</p>}
    </section>
  );
}

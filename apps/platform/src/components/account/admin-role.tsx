"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Badge } from "./ui";

const MESSAGES: Record<string, string> = {
  wrong_password: "That is not your current password.",
  too_many_attempts: "Too many wrong attempts. Please wait a few minutes and try again.",
  no_password: "This account has no password to check.",
  two_factor_required: "Enter the 6-digit code from your authenticator app, or a backup code.",
  wrong_backup_code: "That backup code is not right, or it was already used.",
  wrong_two_factor: "That authenticator code is not right. Check the app and try again.",
  invalid_email: "Enter a valid email address.",
  nominee_is_self: "You are already the Business Admin. Invite someone else.",
  nominee_holds_a_slot: "That person already belongs to a business or a product, so they cannot take over as Business Admin. Invite someone who does not.",
  transfer_pending: "An invitation is already waiting. Withdraw it first to invite someone else.",
  ownership_locked: "This business cannot change its Admin right now. Please contact Platterly support.",
  organisation_not_active: "This business is not active, so its Admin cannot change.",
  email_change_open: "You changed your sign-in email recently and it can still be cancelled. Try again after 24 hours.",
  account_on_hold: "Your account is under review, so the Admin cannot change right now.",
  not_the_admin: "Only the Business Admin can do this.",
};
const GENERIC = "Something went wrong. Nothing was changed. Please try again.";

type State =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; role: "none" }
  | { phase: "ready"; role: "former_admin"; businessName: string }
  | { phase: "ready"; role: "admin"; businessName: string; twoFactor: boolean; blocked: string | null; pending: { nomineeEmail: string; expiresAt: string } | null };

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

async function fetchState(): Promise<State | "signin"> {
  try {
    const res = await fetch("/api/account/admin-transfer", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return "signin";
    const body = (await res.json()) as { status: string; role?: string };
    return !res.ok || body.status !== "ok" ? { phase: "error" } : ({ phase: "ready", ...(body as object) } as State);
  } catch {
    return { phase: "error" };
  }
}

/** The Account's "Admin role" page: hand the Business Admin role to someone else by email invitation. */
export function AdminRole() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [backup, setBackup] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const apply = useCallback((next: State | "signin") => {
    if (next === "signin") window.location.replace("/auth/start?next=%2Fadmin-role");
    else setState(next);
  }, []);
  useEffect(() => {
    let alive = true;
    void fetchState().then((next) => alive && apply(next));
    return () => {
      alive = false;
    };
  }, [apply]);

  async function send(payload: Record<string, unknown>, done: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const twoFactor = state.phase === "ready" && state.role === "admin" && (state.twoFactor || needsTwoFactor);
      const res = await fetch("/api/account/admin-transfer", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ password, ...payload, ...(twoFactor ? (useBackup ? { backupCode: backup.trim() } : { totp }) : {}) }) });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      if (res.ok) {
        setPassword("");
        setTotp("");
        setBackup("");
        setEmail("");
        setNotice(done);
        apply(await fetchState());
      } else {
        if (body.status === "two_factor_required") setNeedsTwoFactor(true);
        setError(MESSAGES[body.status ?? ""] ?? GENERIC);
      }
    } catch {
      setError(GENERIC);
    }
    setBusy(false);
  }

  if (state.phase === "loading") return <p className="pa-muted">Loading…</p>;
  if (state.phase === "error") return <p className="pa-muted" role="alert">We could not load this page. Please try again.</p>;
  if (state.role === "none") return <section className="pa-card"><p className="pa-muted">You are not the Business Admin of a business, so there is nothing to hand over here.</p></section>;
  if (state.role === "former_admin")
    return (
      <section className="pa-card">
        <div className="pa-section-head"><h2>Admin role</h2><Badge tone="neutral">Former Admin</Badge></div>
        <p className="pa-muted">You handed the Business Admin role of {state.businessName} to someone else. You can still see the business, but you cannot change anything or manage its plan and billing. The new Admin can remove you.</p>
      </section>
    );

  const twoFactor = state.twoFactor || needsTwoFactor;
  const confirm = (
    <>
      <div className="pa-field">
        <label htmlFor="ar-password">Current password</label>
        <input id="ar-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {twoFactor && !useBackup && (
        <div className="pa-field">
          <label htmlFor="ar-totp">Authenticator code</label>
          <input id="ar-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} />
          <span className="pa-hint">Two-step verification is on, so we also need the code from your authenticator app.</span>
          <button type="button" className="pa-link" onClick={() => setUseBackup(true)}>Use a backup code instead</button>
        </div>
      )}
      {twoFactor && useBackup && (
        <div className="pa-field">
          <label htmlFor="ar-backup">Backup code</label>
          <input id="ar-backup" autoComplete="off" value={backup} onChange={(e) => setBackup(e.target.value)} />
          <button type="button" className="pa-link" onClick={() => setUseBackup(false)}>Use the authenticator app instead</button>
        </div>
      )}
    </>
  );
  const confirmed = !!password && (!twoFactor || (useBackup ? backup.trim().length > 0 : totp.length === 6));

  return (
    <section className="pa-card pa-form" aria-labelledby="ar-title">
      <div className="pa-section-head"><h2 id="ar-title">Admin role</h2><Badge tone="success">You are the Business Admin</Badge></div>
      <p className="pa-muted">
        You are the Business Admin of <strong>{state.businessName}</strong>. You can hand the role to one other person by email. Nothing changes until they accept. After that you stay on as a member who can see everything but cannot change anything, and you can no longer manage the plan or billing, until the new Admin removes you.
      </p>
      {notice && <p className="pa-muted" role="status">{notice}</p>}
      {state.pending ? (
        <form
          className="pa-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void send({ action: "cancel" }, "The invitation was withdrawn.");
          }}
          noValidate
        >
          <p role="status">An invitation to <strong>{state.pending.nomineeEmail}</strong> is waiting. It ends on {dateOf(state.pending.expiresAt)}.</p>
          <div className="pa-form-grid">{confirm}</div>
          {error && <p className="pa-muted" role="alert">{error}</p>}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-outline" disabled={busy || !confirmed}>Withdraw the invitation</button>
          </div>
        </form>
      ) : state.blocked ? (
        <p className="pa-muted" role="status">{MESSAGES[state.blocked] ?? GENERIC}</p>
      ) : (
        <form
          className="pa-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void send({ action: "start", email }, "Invitation sent. We emailed it to the address you gave.");
          }}
          noValidate
        >
          <div className="pa-form-grid">
            <div className="pa-field">
              <label htmlFor="ar-email">Email of the new Business Admin</label>
              <input id="ar-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              <span className="pa-hint">They must not already belong to a business or use a Platterly product. If they have no Platterly account, they can create one from the invitation.</span>
            </div>
            {confirm}
          </div>
          {error && <p className="pa-muted" role="alert">{error}</p>}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !email || !confirmed}>Send invitation</button>
          </div>
        </form>
      )}
    </section>
  );
}

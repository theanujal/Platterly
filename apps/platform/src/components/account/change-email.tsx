"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./icons";

const MESSAGES: Record<string, string> = {
  wrong_password: "That is not your current password.",
  too_many_attempts: "Too many wrong attempts. Please wait a few minutes and try again.",
  invalid: "Enter a valid email address.",
  same: "That is already your sign-in email.",
  unavailable: "That address cannot be used. Try another.",
  too_soon: "A code was just sent. Please wait a minute before asking for another.",
  wrong_code: "That code is not right. Check it and try again.",
  expired: "That code has expired. Start again.",
  too_many_tries: "Too many wrong codes. Start again.",
  nothing_pending: "There is no change waiting. Start again.",
  send_failed: "We could not send the code. Please try again in a moment.",
  two_factor_required: "Enter the 6-digit code from your authenticator app, or a backup code.",
  wrong_backup_code: "That backup code is not right, or it was already used.",
  wrong_two_factor: "That authenticator code is not right. Check the app and try again.",
};
const GENERIC = "Something went wrong. Nothing was changed. Please try again.";

async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; status: string }> {
  try {
    const res = await fetch("/api/account/email", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
    if (res.status === 401) window.location.replace("/auth/start?next=%2Fsecurity");
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return { ok: res.ok, status: body.status ?? "error" };
  } catch {
    return { ok: false, status: "error" };
  }
}

/** A "Change email" button under the Email row of Security: new address and current password, then the code sent to the new address. */
export function ChangeEmail() {
  const [mode, setMode] = useState<"closed" | "start" | "code" | "done">("closed");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [totp, setTotp] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [backup, setBackup] = useState("");
  const [twoFactor, setTwoFactor] = useState(false);

  /** Whether two-step verification is on is read again every time the form opens, so turning it on in the same visit is noticed. */
  function refreshTwoFactor() {
    fetch("/api/account/email", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((b: { twoFactor?: boolean }) => setTwoFactor(b.twoFactor === true))
      .catch(() => undefined);
  }
  useEffect(refreshTwoFactor, []);

  function open() {
    refreshTwoFactor();
    setMode("start");
    setPassword("");
    setTotp("");
    setCode("");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fail = (status: string) => setError(MESSAGES[status] ?? GENERIC);
    if (mode === "start") {
      const r = await call({ action: "start", password, email, ...(twoFactor ? (useBackup ? { backupCode: backup.trim() } : { totp }) : {}) });
      if (r.ok) {
        setPassword("");
        setTotp("");
        setBackup("");
        setMode("code");
      } else {
        if (r.status === "two_factor_required") setTwoFactor(true);
        fail(r.status);
      }
    } else {
      const r = await call({ action: "confirm", code });
      if (r.ok) setMode("done");
      else fail(r.status);
    }
    setBusy(false);
  }

  return (
    <div className="pa-switch-row pa-setting-row" style={{ flexWrap: "wrap" }}>
      <span className="pa-detail-tile"><Icon name="mail" size={22} /></span>
      <div>
        <span className="pa-row-label">Change email</span>
        <span className="pa-hint">Change the address you sign in with. We send a code to the new address and tell the old one, which can cancel the change for 24 hours. You are signed out of every device when it changes.</span>
      </div>
      {mode === "closed" && (
        <div className="pa-row-actions">
          <button type="button" className="pa-btn pa-btn-outline" onClick={open}>
            Change email
          </button>
        </div>
      )}
      {mode === "done" && (
        <div className="pa-form" style={{ flexBasis: "100%" }}>
          <p className="pa-muted" role="status">
            Your sign-in email was changed. We signed you out of every device and told your old address, which can cancel the change for 24 hours.
          </p>
          <div className="pa-form-actions">
            <a className="pa-btn pa-btn-primary" href="/auth/start">
              Sign in again
            </a>
          </div>
        </div>
      )}
      {(mode === "start" || mode === "code") && (
        <form className="pa-form" style={{ flexBasis: "100%" }} onSubmit={submit} noValidate>
          {mode === "start" ? (
            <div className="pa-form-grid">
              <div className="pa-field">
                <label htmlFor="ce-email">New email address</label>
                <input id="ce-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
                <span className="pa-hint">We send a code to this address to confirm it.</span>
              </div>
              <div className="pa-field">
                <label htmlFor="ce-password">Current password</label>
                <input id="ce-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {twoFactor && !useBackup && (
                <div className="pa-field">
                  <label htmlFor="ce-totp">Authenticator code</label>
                  <input id="ce-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} />
                  <span className="pa-hint">Two-step verification is on, so we also need the code from your authenticator app.</span>
                  <button type="button" className="pa-link" onClick={() => setUseBackup(true)}>
                    Use a backup code instead
                  </button>
                </div>
              )}
              {twoFactor && useBackup && (
                <div className="pa-field">
                  <label htmlFor="ce-backup">Backup code</label>
                  <input id="ce-backup" autoComplete="off" value={backup} onChange={(e) => setBackup(e.target.value)} />
                  <span className="pa-hint">Each backup code works once. Using one here uses it up.</span>
                  <button type="button" className="pa-link" onClick={() => setUseBackup(false)}>
                    Use the authenticator app instead
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="pa-field">
              <label htmlFor="ce-code">6-digit code</label>
              <input id="ce-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <span className="pa-hint">We sent a code to {email.trim().toLowerCase()}. It expires in 10 minutes.</span>
            </div>
          )}
          {error && (
            <p className="pa-muted" role="alert">
              {error}
            </p>
          )}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || (mode === "start" ? !email || !password || (twoFactor && totp.length !== 6) : code.length !== 6)}>
              {mode === "start" ? "Send code" : "Confirm new email"}
            </button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setMode("closed")}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

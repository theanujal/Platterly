"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "./ui";

const MESSAGES: Record<string, string> = {
  wrong_password: "That is not your current password.",
  too_many_attempts: "Too many wrong attempts. Please wait a few minutes and try again.",
  invalid: "Enter a valid email address.",
  same_as_main: "The recovery email must be different from the email you sign in with.",
  too_soon: "A code was just sent. Please wait a minute before asking for another.",
  wrong_code: "That code is not right. Check it and try again.",
  expired: "That code has expired. Ask for a new one.",
  too_many_tries: "Too many wrong codes. Ask for a new code.",
  nothing_pending: "There is no change waiting. Start again.",
  send_failed: "We could not send the code. Please try again in a moment.",
};
const GENERIC = "Something went wrong. Nothing was changed. Please try again.";
type Mode = "closed" | "start" | "code" | "remove";

async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; status: string }> {
  try {
    const res = await fetch("/api/account/recovery-email", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
    if (res.status === 401) window.location.replace("/auth/start?next=%2Fsecurity");
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return { ok: res.ok, status: body.status ?? "error" };
  } catch {
    return { ok: false, status: "error" };
  }
}

/** The "Recovery email" row of Security: a second address, confirmed by a code, that can receive a password-reset code. Used only to reset a password. */
export function RecoveryEmail() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("closed");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/account/recovery-email", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((b: { email?: string | null }) => alive && setEmail(b.email ?? null))
      .catch(() => alive && setEmail(null));
    return () => {
      alive = false;
    };
  }, []);

  function open(next: Mode) {
    setMode(next);
    setPassword("");
    setCode("");
    setError("");
    setNote("");
    if (next !== "code") setAddress("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fail = (status: string) => setError(MESSAGES[status] ?? GENERIC);
    if (mode === "start") {
      const r = await call({ action: "start", password, email: address });
      if (r.ok) {
        setPassword("");
        setMode("code");
      } else fail(r.status);
    } else if (mode === "code") {
      const r = await call({ action: "confirm", code });
      if (r.ok) {
        setEmail(address.trim().toLowerCase());
        setMode("closed");
        setNote("Your recovery email is set.");
      } else fail(r.status);
    } else if (mode === "remove") {
      const r = await call({ action: "remove", password });
      if (r.ok) {
        setEmail(null);
        setMode("closed");
        setNote("Your recovery email was removed.");
      } else fail(r.status);
    }
    setBusy(false);
  }

  return (
    <div className="pa-switch-row" style={{ flexWrap: "wrap" }}>
      <div>
        <span className="pa-row-label">Recovery email</span>
        <span className="pa-hint">{email ? <>Where we send a password-reset code if you cannot reach your main email: {email}</> : "A second address where we can send a password-reset code if you cannot reach your main email. It is used only to reset your password."}</span>
        {note && (
          <span className="pa-hint" role="status">
            {note}
          </span>
        )}
      </div>
      {mode === "closed" && email !== undefined && (
        <div className="pa-row-actions">
          {email ? <Badge tone="success">Set</Badge> : <Badge tone="neutral">Not set</Badge>}
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("start")}>
            {email ? "Change recovery email" : "Add recovery email"}
          </button>
          {email && (
            <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("remove")}>
              Remove
            </button>
          )}
        </div>
      )}
      {mode !== "closed" && (
        <form className="pa-form" style={{ flexBasis: "100%" }} onSubmit={submit} noValidate>
          {mode === "start" && (
            <div className="pa-form-grid">
              <div className="pa-field">
                <label htmlFor="re-address">Recovery email address</label>
                <input id="re-address" type="email" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />
                <span className="pa-hint">We send a code to this address to confirm it.</span>
              </div>
              <div className="pa-field">
                <label htmlFor="re-password">Current password</label>
                <input id="re-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          )}
          {mode === "code" && (
            <div className="pa-field">
              <label htmlFor="re-code">6-digit code</label>
              <input id="re-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <span className="pa-hint">We sent a code to {address}. It expires in 10 minutes.</span>
            </div>
          )}
          {mode === "remove" && (
            <div className="pa-field">
              <label htmlFor="re-password">Current password</label>
              <input id="re-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {error && (
            <p className="pa-muted" role="alert">
              {error}
            </p>
          )}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || (mode === "code" ? code.length !== 6 : mode === "start" ? !address || !password : !password)}>
              {mode === "code" ? "Confirm" : mode === "remove" ? "Remove recovery email" : "Send code"}
            </button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => open("closed")}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

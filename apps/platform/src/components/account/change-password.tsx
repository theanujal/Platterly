"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Badge } from "./ui";

const MESSAGES: Record<string, string> = {
  wrong_password: "That is not your current password.",
  weak: "Choose a new password of at least 8 characters.",
  same: "Choose a password different from your current one.",
  no_password: "This account has no password to change.",
  too_many_attempts: "Too many wrong attempts. Please wait a few minutes and try again.",
};

/** The "Password" row of Security: closed shows a Change password button; open asks for the current password, the new one twice. */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string>("");

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (next.length < 8) return setError(MESSAGES.weak);
    if (next !== confirm) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ current, next }) });
      const body = (await res.json().catch(() => null)) as { status?: string; endedOthers?: number } | null;
      if (res.status === 401) return void window.location.replace("/auth/start?next=%2Fsecurity");
      if (res.ok && body?.status === "ok") {
        close();
        setDone(body.endedOthers ? `Your password was changed. You were signed out on ${body.endedOthers} other device${body.endedOthers === 1 ? "" : "s"}.` : "Your password was changed.");
      } else setError((body?.status && MESSAGES[body.status]) || "We could not change your password. Nothing was changed. Please try again.");
    } catch {
      setError("We could not change your password. Nothing was changed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pa-switch-row pa-setting-row" style={{ flexWrap: "wrap" }}>
      <span className="pa-detail-tile"><Icon name="lock" size={22} /></span>
      <div>
        <span className="pa-row-label">Password</span>
        <span className="pa-hint">Change your password regularly to keep your account secure. Your other devices are signed out when you do.</span>
        {done && (
          <span className="pa-hint" role="status">
            {done}
          </span>
        )}
      </div>
      {!open && (
        <div className="pa-row-actions">
          <Badge tone="success">Set</Badge>
          <button type="button" className="pa-btn pa-btn-outline" onClick={() => (setDone(""), setOpen(true))}>
            Change password <Icon name="arrowRight" size={16} />
          </button>
        </div>
      )}
      {open && (
        <form className="pa-form" style={{ flexBasis: "100%" }} onSubmit={submit} noValidate>
          <div className="pa-form-grid">
            <div className="pa-field">
              <label htmlFor="cp-current">Current password</label>
              <input id="cp-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="pa-field">
              <label htmlFor="cp-new">New password</label>
              <input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              <span className="pa-hint">At least 8 characters.</span>
            </div>
            <div className="pa-field">
              <label htmlFor="cp-confirm">Confirm new password</label>
              <input id="cp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          {error && (
            <p className="pa-muted" role="alert">
              {error}
            </p>
          )}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || !current || !next || !confirm}>
              Save new password
            </button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

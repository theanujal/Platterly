"use client";

import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Badge } from "./ui";

const MESSAGES: Record<string, string> = {
  wrong_password: "That is not your current password.",
  too_many_attempts: "Too many wrong attempts. Please wait a few minutes and try again.",
  wrong_code: "That code is not right. Check the code in your authenticator app and try again.",
  already_on: "Two-step verification is already on.",
};
const GENERIC = "Something went wrong. Nothing was changed. Please try again.";
type Mode = "closed" | "password-start" | "scan" | "codes" | "password-codes" | "password-off";

async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; status: string; totpUri?: string; backupCodes?: string[] }> {
  try {
    const res = await fetch("/api/account/two-factor", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
    if (res.status === 401) window.location.replace("/auth/start?next=%2Fsecurity");
    const body = (await res.json().catch(() => ({}))) as { status?: string; totpUri?: string; backupCodes?: string[] };
    return { ok: res.ok, status: body.status ?? "error", totpUri: body.totpUri, backupCodes: body.backupCodes };
  } catch {
    return { ok: false, status: "error" };
  }
}

/** The "Two-step verification" row of Security: set up an authenticator app (QR code, first code, backup codes), make new backup codes, or turn it off. */
export function TwoFactor() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("closed");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [uri, setUri] = useState("");
  const [qr, setQr] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/two-factor", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((b: { enabled?: boolean }) => alive && setEnabled(b.enabled === true))
      .catch(() => alive && setEnabled(false));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!uri) return;
    QRCode.toDataURL(uri, { margin: 1, width: 192 }).then(setQr, () => setQr(""));
  }, [uri]);

  function open(next: Mode) {
    setMode(next);
    setPassword("");
    setCode("");
    setError("");
    setNote("");
  }
  const secret = uri ? (new URL(uri).searchParams.get("secret") ?? "") : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fail = (status: string) => setError(MESSAGES[status] ?? GENERIC);
    if (mode === "password-start") {
      const r = await call({ action: "start", password });
      if (r.ok && r.totpUri) {
        setUri(r.totpUri);
        setCodes(r.backupCodes ?? []);
        setMode("scan");
        setPassword("");
      } else fail(r.status);
    } else if (mode === "scan") {
      const r = await call({ action: "confirm", code });
      if (r.ok) {
        setEnabled(true);
        setUri("");
        setMode("codes");
      } else fail(r.status);
    } else if (mode === "password-codes") {
      const r = await call({ action: "backup_codes", password });
      if (r.ok && r.backupCodes) {
        setCodes(r.backupCodes);
        setMode("codes");
      } else fail(r.status);
    } else if (mode === "password-off") {
      const r = await call({ action: "disable", password });
      if (r.ok) {
        setEnabled(false);
        setCodes([]);
        setMode("closed");
        setNote("Two-step verification is off.");
      } else fail(r.status);
    }
    setBusy(false);
  }

  const asking = mode === "password-start" || mode === "password-codes" || mode === "password-off";
  return (
    <div className="pa-switch-row pa-setting-row" style={{ flexWrap: "wrap" }}>
      <span className="pa-detail-tile"><Icon name="shield" size={22} /></span>
      <div>
        <span className="pa-row-label">Two-step verification</span>
        <span className="pa-hint">Add an extra layer of security to your account: a code from an authenticator app when you sign in, as well as your password.</span>
        {note && (
          <span className="pa-hint" role="status">
            {note}
          </span>
        )}
      </div>
      {mode === "closed" && (
        <div className="pa-row-actions">
          {enabled === null ? null : enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Not enabled</Badge>}
          {enabled === false && (
            <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("password-start")}>
              Enable 2FA <Icon name="arrowRight" size={16} />
            </button>
          )}
          {enabled === true && (
            <>
              <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("password-codes")}>
                New backup codes
              </button>
              <button type="button" className="pa-btn pa-btn-outline" onClick={() => open("password-off")}>
                Turn off
              </button>
            </>
          )}
        </div>
      )}
      {mode === "codes" && (
        <div className="pa-form" style={{ flexBasis: "100%" }}>
          <p className="pa-muted" role="status">
            Two-step verification is on. Save these backup codes somewhere safe. Each works once if you lose your phone. They are shown only now.
          </p>
          <ul aria-label="Backup codes" style={{ columns: 2, listStyle: "none", padding: 0, fontFamily: "monospace" }}>
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="pa-form-actions">
            <button type="button" className="pa-btn pa-btn-primary" onClick={() => (setCodes([]), open("closed"))}>
              I have saved them
            </button>
          </div>
        </div>
      )}
      {(asking || mode === "scan") && (
        <form className="pa-form" style={{ flexBasis: "100%" }} onSubmit={submit} noValidate>
          {asking && (
            <div className="pa-field">
              <label htmlFor="tf-password">Current password</label>
              <input id="tf-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {mode === "scan" && (
            <>
              <p className="pa-muted">Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy), then enter the 6-digit code it shows.</p>
              {uri && qr && (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URL made in the browser
                <img src={qr} width={192} height={192} alt="QR code for your authenticator app" />
              )}
              <p className="pa-hint">
                Cannot scan? Enter this key by hand: <code>{secret}</code>
              </p>
              <div className="pa-field">
                <label htmlFor="tf-code">6-digit code</label>
                <input id="tf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            </>
          )}
          {error && (
            <p className="pa-muted" role="alert">
              {error}
            </p>
          )}
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy || (asking ? !password : code.length !== 6)}>
              {mode === "scan" ? "Turn on" : mode === "password-off" ? "Turn off two-step verification" : mode === "password-codes" ? "Make new backup codes" : "Continue"}
            </button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => (setUri(""), open("closed"))}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

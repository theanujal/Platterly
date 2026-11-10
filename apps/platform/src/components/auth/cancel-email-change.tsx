"use client";

import { useState, type FormEvent } from "react";
import { AuthCard } from "./forms";

const MESSAGES: Record<string, string> = {
  invalid: "This link is not valid. It may already have been used, or it may be wrong.",
  expired: "The 24 hours are over, so this change can no longer be cancelled here. If it was not you, reset your password and contact Platterly support.",
  already_cancelled: "This change was already cancelled.",
  unavailable: "We could not put the old address back because another account now uses it. Please contact Platterly support.",
  reason_required: "Choose why you are cancelling. If you choose Other, please tell us a little more.",
};
const REASONS = [
  { code: "not_me", label: "This was not me" },
  { code: "mistake", label: "I started this by mistake" },
  { code: "other", label: "Other" },
] as const;

/** The page behind the cancel link in the old address's notice. It asks for a reason and a click, so opening the link (or a mail scanner doing so) changes nothing. */
export function CancelEmailChange({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | { error: string }>("ask");
  const [code, setCode] = useState<(typeof REASONS)[number]["code"] | "">("");
  const [note, setNote] = useState("");

  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!code) return setState({ error: MESSAGES.reason_required });
    setState("busy");
    try {
      const res = await fetch("/api/email-change/cancel", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ token, reason: { code, note } }) });
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      setState(res.ok ? "done" : { error: MESSAGES[body?.status ?? ""] ?? "Something went wrong. Nothing was changed. Please try again." });
    } catch {
      setState({ error: "Something went wrong. Nothing was changed. Please try again." });
    }
  }

  if (state === "done")
    return (
      <AuthCard title="Email change cancelled" lede="Your sign-in email is back to the original address and everyone was signed out. Your account is now on hold: Platterly will verify that it is really you before you can sign in again.">
        <p className="pl-auth-ok" role="status">
          We have told the Platterly team. If you need to reach us sooner, contact Platterly support.
        </p>
      </AuthCard>
    );
  return (
    <AuthCard title="Cancel the email change?" lede="Someone changed the sign-in email of your Platterly account. Cancelling puts the old address back and puts your account on hold until Platterly has verified you.">
      <form className="pl-auth-form" onSubmit={cancel} noValidate>
        {typeof state === "object" && (
          <p className="pl-auth-error" role="alert">
            {state.error}
          </p>
        )}
        <fieldset className="pl-auth-form" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Why are you cancelling?</legend>
          {REASONS.map((r) => (
            <label key={r.code} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="radio" name="reason" value={r.code} checked={code === r.code} onChange={() => setCode(r.code)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="note">{code === "other" ? "Tell us more" : "Anything else we should know? (optional)"}</label>
          <textarea id="note" name="note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
        </div>
        <button type="submit" className="pa-btn pa-btn-primary" disabled={state === "busy"}>
          {state === "busy" ? "Cancelling…" : "Yes, cancel the change"}
        </button>
      </form>
    </AuthCard>
  );
}

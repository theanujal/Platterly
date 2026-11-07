"use client";

import { useState } from "react";
import { AuthCard } from "./forms";

const MESSAGES: Record<string, string> = {
  invalid: "This link is not valid. It may already have been used, or it may be wrong.",
  expired: "The 72 hours are over, so this change can no longer be cancelled here. If it was not you, reset your password and contact Platterly support.",
  already_cancelled: "This change was already cancelled.",
  unavailable: "We could not put the old address back because another account now uses it. Please contact Platterly support.",
};

/** The page behind the cancel link in the old address's notice. It asks for a click first, so opening the link (or a mail scanner doing so) changes nothing. */
export function CancelEmailChange({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | { error: string }>("ask");

  async function cancel() {
    setState("busy");
    try {
      const res = await fetch("/api/email-change/cancel", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ token }) });
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      setState(res.ok ? "done" : { error: MESSAGES[body?.status ?? ""] ?? "Something went wrong. Nothing was changed. Please try again." });
    } catch {
      setState({ error: "Something went wrong. Nothing was changed. Please try again." });
    }
  }

  if (state === "done")
    return (
      <AuthCard title="Email change cancelled" lede="Your sign-in email is back to the original address, and everyone was signed out. Reset your password now if you did not make the change.">
        <a className="pa-btn pa-btn-primary" href="/auth/start">
          Sign in
        </a>
      </AuthCard>
    );
  return (
    <AuthCard title="Cancel the email change?" lede="Someone changed the sign-in email of your Platterly account. If it was not you, cancel it here.">
      {typeof state === "object" && (
        <p className="pl-auth-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="button" className="pa-btn pa-btn-primary" disabled={state === "busy"} onClick={cancel}>
        {state === "busy" ? "Cancelling…" : "Yes, cancel the change"}
      </button>
    </AuthCard>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Badge } from "./ui";

type Entry = { id: string; outcome: "signed_in" | "wrong_password"; device: string; at: string };
type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; entries: Entry[] };

/** The person's own sign-ins and refused attempts of the last 90 days: when, on what kind of device, and whether it worked. */
export function SignInHistory() {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/sign-in-history", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (!res.ok) return setState({ phase: "error" });
        const body = (await res.json()) as { entries?: Entry[] };
        if (alive) setState(Array.isArray(body.entries) ? { phase: "ready", entries: body.entries } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="pa-card pa-form" aria-labelledby="sc-history">
      <div className="pa-section-head">
        <h2 id="sc-history">
          <Icon name="shield" size={16} /> Sign-in history
        </h2>
      </div>
      <p className="pa-hint">Your sign-ins and refused attempts from the last 90 days. If you see one you do not recognise, change your password.</p>
      {state.phase === "loading" && (
        <p className="pa-muted" role="status" aria-busy="true">
          Loading your sign-in history…
        </p>
      )}
      {state.phase === "error" && (
        <p className="pa-muted" role="alert">
          We could not load your sign-in history. Please reload the page.
        </p>
      )}
      {state.phase === "ready" && state.entries.length === 0 && <p className="pa-muted">Nothing recorded yet.</p>}
      {state.phase === "ready" && state.entries.length > 0 && (
        <ul className="pa-sessions" aria-label="Sign-in history">
          {state.entries.map((e) => (
            <li className="pa-session" key={e.id}>
              <span className="pa-session-text">
                <span className="pa-row-label">{e.device}</span>
                <span className="pa-hint">{new Date(e.at).toLocaleString()}</span>
              </span>
              {e.outcome === "signed_in" ? <Badge tone="success">Signed in</Badge> : <Badge tone="warning">Wrong password</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toggleScriptAction } from "../actions";

/** The design system's switch (44 x 24, orange when on) for one script. It sits inside the accordion's summary, so a click must not open or close the accordion. */
export function ScriptSwitch({ id, name, enabled }: { id: string; name: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
      <span className="text-xs text-muted-foreground" aria-hidden>{on ? "On" : "Off"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name} is ${on ? "on" : "off"}`}
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const next = !on;
          setOn(next);
          setError(null);
          start(async () => {
            const result = await toggleScriptAction(id, next);
            if (result.error) { setOn(!next); setError(result.error); }
          });
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 ${on ? "bg-primary" : "bg-[#E5E7EB]"}`}
      >
        <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
    </span>
  );
}

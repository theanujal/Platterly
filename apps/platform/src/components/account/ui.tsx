import type { ReactNode } from "react";

export type Tone = "neutral" | "info" | "warning" | "success";

/** Status badge from the design system: a pill with a dot, one tone per meaning. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`pa-badge pa-badge-${tone}`}>
      <span className="pa-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Avatar({ label, size = "md", round = false, photo }: { label: string; size?: "sm" | "md" | "lg" | "xl"; round?: boolean; photo?: string }) {
  return (
    <span className={`pa-avatar pa-avatar-${size}${round ? " pa-avatar-round" : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a private, same-origin picture; nothing to optimise */}
      {photo ? <img src={photo} alt="" className="pa-avatar-img" /> : label}
    </span>
  );
}

export function PageHeader({ title, lede, action }: { title: string; lede: string; action?: ReactNode }) {
  return (
    <header className="pa-page-head">
      <div>
        <h1>{title}</h1>
        <p>{lede}</p>
      </div>
      {action}
    </header>
  );
}

/** Marks a section whose controls depend on something that is not built yet. */
export function PlaceholderNote({ children }: { children: ReactNode }) {
  return (
    <p className="pa-placeholder" role="note">
      <Badge tone="warning">Placeholder</Badge>
      <span>{children}</span>
    </p>
  );
}

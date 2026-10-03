import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { TenantStatus } from "@/generated/prisma/enums";
import { cn } from "cn";

/** Initials on a tinted circle, the Customer card's avatar: one tone per name, from a hash. */
const TONES = ["bg-primary/10 text-primary", "bg-info/10 text-info", "bg-tone-pink/10 text-tone-pink", "bg-success/10 text-success", "bg-tone-violet/10 text-tone-violet", "bg-tone-cyan/10 text-tone-cyan", "bg-tone-yellow/10 text-tone-yellow", "bg-tone-teal/10 text-tone-teal"];

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", TONES[hash % TONES.length], size === "sm" ? "size-9 text-xs" : size === "md" ? "size-10 text-sm" : "size-14 text-base")}>{initialsOf(name)}</span>;
}

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return <Badge variant={status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "neutral"}>{status === "ACTIVE" ? "Active" : status === "SUSPENDED" ? "Suspended" : "Deactivated"}</Badge>;
}

/** Days left on a trial, in the same bands as the Orders countdown: green 3+, yellow 1-2, orange today, danger once ended. */
export function trialBadge(trialEndsAt: Date | null, now = new Date()): { label: string; variant: "success" | "yellow" | "orange" | "danger" } | null {
  if (!trialEndsAt) return null;
  const days = Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: "Ended", variant: "danger" };
  if (days === 0) return { label: "Ends today", variant: "orange" };
  return { label: `${days} ${days === 1 ? "day" : "days"}`, variant: days <= 2 ? "yellow" : "success" };
}

export function StatTile({ icon, label, value, tone = "primary" }: { icon: ReactNode; label: string; value: number | string; tone?: "primary" | "success" | "info" | "warning" | "danger" }) {
  const toneClass = { primary: "bg-primary/10 text-primary", success: "bg-success/10 text-success", info: "bg-info/10 text-info", warning: "bg-warning/10 text-warning", danger: "bg-destructive/10 text-destructive" }[tone];
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5", toneClass)}>{icon}</span>
      <div className="min-w-0">
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
        <span className="block text-2xl leading-tight font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</span>
      </div>
    </div>
  );
}

export function Panel({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{icon}</span>
        {title}
        {action && <span className="ml-auto text-sm font-medium">{action}</span>}
      </h2>
      {children}
    </section>
  );
}

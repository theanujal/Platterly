import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Small building blocks that follow the design system: 10px radius, 44px / 38px buttons, orange primary, 5-tone badges. */

const BUTTON_BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
const BUTTON_SIZES = { default: "h-11 px-4 text-sm", md: "h-[38px] px-3.5 text-[13.5px]" } as const;
const BUTTON_VARIANTS = {
  primary: "bg-primary text-primary-foreground border-transparent hover:bg-[#e65f00]",
  outline: "bg-white text-foreground border-border hover:bg-muted",
  danger: "bg-white text-destructive border-destructive/40 hover:bg-destructive/10",
} as const;

export function buttonClass(variant: keyof typeof BUTTON_VARIANTS = "primary", size: keyof typeof BUTTON_SIZES = "default") {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]}`;
}

export function Button({ variant = "primary", size = "default", className = "", ...props }: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_VARIANTS; size?: keyof typeof BUTTON_SIZES }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function LinkButton({ variant = "primary", size = "default", className = "", ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON_VARIANTS; size?: keyof typeof BUTTON_SIZES }) {
  return <Link {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

const TONES = {
  neutral: "bg-secondary text-foreground",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs ${TONES[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)] ${className}`}>{children}</section>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const inputClass = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="h-11 px-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:px-3 [&_td]:py-3">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function formatWhen(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}

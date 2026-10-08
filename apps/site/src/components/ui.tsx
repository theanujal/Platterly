import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost" | "outline" | "light";

/** Calendly's button: 48px tall, 8px corners, Geist 500, colour changes over 150ms. Primary is Midnight with Magnolia text. */
const BASE = "inline-flex min-h-12 items-center justify-center gap-2 rounded-button px-5 py-2.5 text-base font-medium leading-tight whitespace-nowrap transition-colors duration-150 ease-calendly [&_svg]:transition-transform [&_svg]:duration-150 hover:[&_svg]:translate-x-0.5";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink-navy text-cloud hover:bg-[#1b2f48]",
  dark: "bg-ink-navy text-cloud hover:bg-[#1b2f48]",
  outline: "border border-ink-navy bg-transparent text-ink-navy hover:bg-ink-navy/5",
  ghost: "px-3 text-ink-navy hover:bg-ink-navy/5",
  light: "bg-cloud text-ink-navy hover:bg-paper",
};

export function buttonClasses(variant: Variant = "primary", className = "") {
  return `${BASE} ${VARIANT[variant]} ${className}`;
}

/** The one link-styled-as-button. Outside addresses open normally (no new tab); the CTA targets are all our own hosts. */
export function ButtonLink({ href, variant = "primary", children, className = "" }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  const classes = buttonClasses(variant, className);
  if (/^(https?:|mailto:)/.test(href)) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** A quiet label: Midnight on a Midnight tint. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-ink-navy/5 px-3 py-1 text-xs font-medium text-ink-navy">{children}</span>;
}

/** Centered intro for a section: a small uppercase label, a big Midnight heading, grey sub-text, an optional action. */
export function SectionHeader({ id, eyebrow, title, children, action }: { id?: string; eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 id={id} className="h-section">
        {title}
      </h2>
      {children && <p className="max-w-2xl text-lg leading-relaxed text-slate-gray sm:text-xl">{children}</p>}
      {action}
    </div>
  );
}

/** A page section on the magnolia page: max 1200px, generous air above and below. */
export function Section({ children, className = "", label }: { children: ReactNode; className?: string; tone?: "canvas" | "paper" | "navy"; label?: string }) {
  return (
    <section aria-labelledby={label} className={className}>
      <div className="mx-auto w-full max-w-[1200px] px-5 py-14 sm:px-8 md:py-20">{children}</div>
    </section>
  );
}

/** One of Calendly's big rounded panels, inset from the page edge: linen by default. */
export function Panel({ children, className = "", tone = "linen", id, label }: { children: ReactNode; className?: string; tone?: "linen" | "tint" | "dark"; id?: string; label?: string }) {
  const bg = tone === "dark" ? "bg-ink-navy text-cloud" : tone === "tint" ? "bg-badge-fill" : "bg-pebble";
  return (
    <section id={id} aria-labelledby={label} className="px-3 sm:px-6">
      <div className={`rounded-[28px] sm:rounded-[40px] ${bg} ${className}`}>{children}</div>
    </section>
  );
}

import type { ReactNode } from "react";

/** The opening panel of every content page: the same gradient as the product hero, a headline and one line. */
export function PageHero({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="px-3 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-[28px] px-5 py-20 text-center sm:rounded-[40px] md:py-28" style={{ background: "var(--aurora)" }}>
        {eyebrow && <p className="eyebrow enter">{eyebrow}</p>}
        <h1 id="page-title" style={{ "--d": "60ms" } as React.CSSProperties} className="h-hero enter mx-auto mt-4 max-w-4xl">
          {title}
        </h1>
        {children && (
          <div style={{ "--d": "160ms" } as React.CSSProperties} className="enter mx-auto mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl">
            {children}
          </div>
        )}
        {actions && (
          <div style={{ "--d": "260ms" } as React.CSSProperties} className="enter mt-9 flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

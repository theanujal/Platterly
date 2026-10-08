import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

/** The closing band: a warm aurora with a rounded top, a heading, a line of copy and the call-to-action buttons. */
export function ClosingBand({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby="final" className="relative mt-24 overflow-x-clip rounded-t-[40px] pb-24 pt-20 md:mt-36 md:rounded-t-[56px] md:pb-32 md:pt-28" style={{ background: "var(--band-bg)" }}>
      <Reveal className="relative z-20 mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 text-center">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="final" className="h-section">
          {title}
        </h2>
        <div className="flex flex-col items-center gap-6 text-lg leading-relaxed sm:text-xl">{children}</div>
      </Reveal>
    </section>
  );
}

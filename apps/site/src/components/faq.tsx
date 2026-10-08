"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";

/**
 * An accordion that opens and closes smoothly: the answer sits in a grid row that animates between 0fr and 1fr, and the
 * plus turns into a cross. One question is open at a time. The answers stay in the page (collapsed, not removed) so
 * search engines and the FAQ structured data still match what is on screen.
 */
export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  return (
    <div className="mx-auto max-w-3xl divide-y divide-hairline rounded-[24px] bg-paper px-6 sm:px-8">
      {items.map((item, index) => {
        const on = open === index;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={`${base}-${index}`}
                onClick={() => setOpen(on ? null : index)}
                className="group flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ink-navy"
              >
                <span className="transition-colors duration-200 group-hover:text-ink-navy/70">{item.q}</span>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-calendly ${on ? "rotate-45 bg-ink-navy text-paper" : "bg-ink-navy/5 group-hover:bg-ink-navy/10"}`}>
                  <Plus className="size-4" strokeWidth={2.25} aria-hidden />
                </span>
              </button>
            </h3>
            <div id={`${base}-${index}`} role="region" aria-label={item.q} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-calendly ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <p className="pb-5 pr-12 leading-relaxed text-slate-gray">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

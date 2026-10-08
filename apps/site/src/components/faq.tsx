import { ChevronDown } from "lucide-react";

/** Native details/summary: opens and closes with no script, works with the keyboard, and the answers stay in the page for search. */
export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-hairline rounded-[24px] bg-paper px-6 sm:px-8">
      {items.map((item) => (
        <details key={item.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-5 shrink-0 text-ink-navy transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
          </summary>
          <p className="mt-3 leading-relaxed text-slate-gray">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

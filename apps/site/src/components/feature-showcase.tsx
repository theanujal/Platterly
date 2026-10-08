"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { ProductTile } from "@/components/product-tile";
import { UiCard, type UiCardName } from "@/components/ui-cards";
import { productVars, type Product } from "@/content/products";

export interface ShowcaseItem {
  id: string;
  icon: string;
  title: string;
  text: string;
  card: UiCardName;
  /** When set, the arrow button becomes a link to the product page. */
  href?: string;
}

/**
 * Calendly's feature chapter: a small product label, a big heading and a list on one side where one item is open at a
 * time (the others fade back), and a large rounded gradient panel on the other holding the real screen of the open
 * item in a white frame. The first item is open in the HTML, so it works without scripts.
 */
const WAYS = ["sunrise", "blossom", "citrus", "dusk"] as const;
/** Small white tiles that overlap the corner of the panel, like the app icons on calendly.com's cards. Decorative. */
const FLOATS: Record<string, readonly string[]> = { order: ["clipboard"], orders: ["clipboard", "wallet"], calendar: ["calendar"], menu: ["book"], approval: ["users", "wallet"], kitchen: ["chef"], staffing: ["truck"], customers: ["users"], payment: ["wallet"] };

export function FeatureShowcase({ id, label, product, title, items, flip = false }: { id?: string; label: string; product: Product; title: string; items: readonly ShowcaseItem[]; flip?: boolean }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  const item = items[open];
  /** The line under the open item fills over seven seconds and then the next item opens; a click or hover takes over. */
  function advance() {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOpen((v) => (v + 1) % items.length);
  }
  return (
    <section aria-labelledby={id} style={productVars(product)} className="mx-auto w-full max-w-[1200px] px-5 py-16 sm:px-8 md:py-24">
      <div className={`grid items-center gap-10 lg:gap-20 ${flip ? "lg:grid-cols-[1.1fr_0.9fr]" : "lg:grid-cols-[0.9fr_1.1fr]"}`}>
        <Reveal from={flip ? "right" : "left"} className={flip ? "lg:order-2" : ""}>
          <p className="inline-flex items-center gap-2 text-base font-medium">
            <ProductTile product={product} className="size-6 !rounded-md" iconClass="size-4" />
            {label}
          </p>
          <h2 id={id} className="h-serif mt-4 max-w-xl">
            {title}
          </h2>
          <ul className="mt-10 border-t border-ink-navy/15">
            {items.map((entry, index) => {
              const selected = index === open;
              return (
                <li key={entry.id} className="relative border-b border-ink-navy/15">
                  {selected && <span aria-hidden key={`${entry.id}-${open}`} onAnimationEnd={() => advance()} className="fill-line absolute -bottom-px left-0 h-0.5 w-full bg-product" />}
                  <h3>
                    <button
                      type="button"
                      aria-expanded={selected}
                      aria-controls={`${base}-${entry.id}`}
                      onClick={() => setOpen(index)}
                      onMouseEnter={() => setOpen(index)}
                      className={`flex w-full items-center gap-3 py-5 text-left text-xl font-medium outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-ink-navy ${selected ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                    >
                      <Icon name={entry.icon} className="size-6 shrink-0" />
                      <span className="flex-1">{entry.title}</span>
                    </button>
                  </h3>
                  <div id={`${base}-${entry.id}`} hidden={!selected} className="tab-swap pb-6 pl-9 pr-14 text-base leading-relaxed text-slate-gray sm:text-lg">
                    <div className="flex items-start gap-4">
                      <p className="flex-1">{entry.text}</p>
                      {entry.href ? (
                        <Link href={entry.href} aria-label={`Learn more about ${entry.title}`} className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-navy/5 transition-colors duration-150 hover:bg-ink-navy/15">
                          <ArrowUpRight className="size-4" aria-hidden />
                        </Link>
                      ) : (
                        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-navy/5" aria-hidden>
                          <ArrowUpRight className="size-4" />
                        </span>
                      )}
                    </div>
                    <div className={`cw-${WAYS[index % WAYS.length]} mt-5 rounded-[28px] p-6 lg:hidden`}>
                      <UiCard name={entry.card} size="sm" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
        <Reveal from="scale" delay={100} className={`hidden lg:block ${flip ? "lg:order-1" : ""}`}>
          <div className={`cw-${WAYS[open % WAYS.length]} relative rounded-[56px] p-14 transition-[background-position] duration-700`}>
            {FLOATS[item.card]?.map((icon, i) => (
              <span key={icon} aria-hidden className="absolute z-10 flex size-[4.5rem] items-center justify-center rounded-[22px] bg-paper shadow-product" style={{ right: i === 0 ? "-1.25rem" : "-2.25rem", top: i === 0 ? "2.5rem" : "8.5rem" }}>
                <Icon name={icon} className="size-9 text-brand" />
              </span>
            ))}
            <div key={item.id} className="tab-swap">
              <UiCard name={item.card} size="lg" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

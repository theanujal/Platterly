"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { UiCard, type UiCardName } from "@/components/ui-cards";
import { Reveal } from "@/components/reveal";

export interface Step {
  title: string;
  text: string;
  points: readonly string[];
  card: UiCardName;
}

/**
 * Calendly's "Book / Prep / Capture / Follow up" row. Four tall white cards share one row; the one you hover or focus
 * widens (twice the others) and shows its steps and a real close-up; the others fold back to a title and one line, with
 * only a faint tint where the close-up will be, so one thing at a time asks for attention. The first card is open to begin with. Below 1024px every card is open, one under the other.
 */
export function StepCards({ steps }: { steps: readonly Step[] }) {
  const [active, setActive] = useState(0);
  const ways = ["sunrise", "blossom", "citrus", "dusk"] as const;
  return (
    <ol className="mt-14 flex flex-col gap-3 lg:flex-row" onMouseLeave={() => setActive(0)}>
      {steps.map((step, index) => {
        const on = index === active;
        return (
          <Reveal as="li" key={step.title} delay={index * 90} className={`flex min-h-[26rem] flex-col overflow-hidden rounded-[32px] bg-paper transition-[flex-grow,box-shadow] duration-500 ease-calendly lg:min-h-[34rem] lg:basis-0 ${on ? "lg:grow-[2] lg:shadow-product" : "lg:grow"}`}>
            <div tabIndex={0} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-ink-navy">
              <div className="p-6 lg:p-7">
                <h3 className="h-sub !text-[1.5rem] sm:!text-[1.75rem] lg:!text-[1.375rem] xl:!text-[1.5rem] lg:whitespace-nowrap">{step.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-gray sm:text-base">{step.text}</p>
                <ul className={`mt-5 flex flex-col gap-2.5 text-sm transition-[opacity,max-height] duration-500 ease-calendly lg:overflow-hidden ${on ? "lg:max-h-40 lg:opacity-100" : "lg:max-h-0 lg:opacity-0"}`}>
                  {step.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky text-ink-navy">
                        <Check className="size-3" strokeWidth={3} aria-hidden />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative mt-auto h-[23rem] shrink-0 overflow-hidden">
                <div aria-hidden className={`cw-${ways[index % ways.length]} absolute inset-0 transition-opacity duration-500 ease-calendly ${on ? "" : "lg:opacity-15"}`} />
                <div className={`relative flex h-full items-end justify-center px-4 pb-4 pt-8 transition duration-500 ease-calendly ${on ? "" : "lg:translate-y-6 lg:opacity-0"}`}>
                  <UiCard name={step.card} size="sm" className="mx-auto max-w-[320px]" />
                </div>
              </div>
            </div>
          </Reveal>
        );
      })}
    </ol>
  );
}

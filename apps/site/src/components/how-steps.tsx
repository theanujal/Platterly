"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { UiCard, type UiCardName } from "@/components/ui-cards";

export interface HowStep {
  card: UiCardName;
  title: string;
  text: string;
  colourway: "sunrise" | "blossom" | "citrus" | "dusk";
}

/**
 * "Easy and flexible", as calendly.com's product pages show it: a row of coloured cards, each holding a tiny designed
 * version of one screen, with a numbered caption underneath. It scrolls sideways (snap, arrows, touch, keyboard).
 */
export function HowSteps({ steps }: { steps: readonly HowStep[] }) {
  const row = useRef<HTMLOListElement>(null);
  const move = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * Math.min(460, row.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="relative">
      <ol ref={row} tabIndex={0} aria-label="How it works, scroll sideways" className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-6 scroll-pl-5 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ink-navy sm:scroll-pl-12 sm:px-12 [&::-webkit-scrollbar]:hidden">
        {steps.map((step, index) => (
          <Reveal as="li" key={step.title} delay={index * 80} className="w-[min(420px,82vw)] shrink-0 snap-start">
            <div className={`cw-${step.colourway} relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[32px] p-8`}>
              <div aria-hidden className="bars absolute inset-x-0 top-[26%] h-[48%] opacity-70" />
              <UiCard name={step.card} size="sm" className="relative w-full max-w-[320px]" />
            </div>
            <p className="mt-6 text-base leading-relaxed text-slate-gray sm:text-lg">
              <strong className="font-medium text-ink-navy">
                {String(index + 1).padStart(2, "0")} — {step.title}
              </strong>{" "}
              {step.text}
            </p>
          </Reveal>
        ))}
      </ol>
      <div className="mt-4 flex justify-center gap-3">
        <button type="button" onClick={() => move(-1)} aria-label="Previous steps" className="flex size-11 items-center justify-center rounded-full border border-ink-navy/30 transition-colors duration-150 hover:bg-ink-navy/5">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="Next steps" className="flex size-11 items-center justify-center rounded-full border border-ink-navy/30 transition-colors duration-150 hover:bg-ink-navy/5">
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

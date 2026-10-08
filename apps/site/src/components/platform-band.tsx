"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, Star } from "lucide-react";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { PLATFORM } from "@/content/platform";

const GAP = 32;

function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const motionReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The home page's closing band: where Platterly is today and what is next. The same warm aurora as the Catering page's
 * closing band, a two-tone heading and one button, then a row of product cards (one live, the rest coming soon) with
 * the open one in the middle and its neighbours smaller and fading in from the sides. It moves on every five seconds
 * (not for people who ask for less motion, nor while the pointer or focus is on it); the dots, arrow keys, swipe and a
 * click on a neighbour move it too.
 */
export function PlatformBand({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const still = useSyncExternalStore(subscribeMotion, motionReduced, () => false);
  const last = PLATFORM.cards.length - 1;
  const halted = paused || still;

  useEffect(() => {
    if (halted) return;
    const timer = window.setTimeout(() => setIndex((v) => (v === last ? 0 : v + 1)), 5000);
    return () => window.clearTimeout(timer);
  }, [index, halted, last]);

  return (
    <section aria-labelledby="platform" className="relative mt-24 overflow-x-clip rounded-t-[40px] pb-24 pt-20 md:mt-36 md:rounded-t-[56px] md:pb-32 md:pt-28" style={{ background: "var(--band-bg)" }}>
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 text-center">
        <p className="eyebrow">{PLATFORM.eyebrow}</p>
        <h2 id="platform" className="h-section">
          {PLATFORM.title} <span className="block text-brand">{PLATFORM.accent}</span>
        </h2>
        <div className="flex flex-col items-center gap-6 text-lg leading-relaxed sm:text-xl">{children}</div>
      </Reveal>

      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Platterly products"
        tabIndex={0}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX === null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          setTouchX(null);
          if (Math.abs(dx) > 48) setIndex((v) => (dx < 0 ? Math.min(last, v + 1) : Math.max(0, v - 1)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setIndex((v) => Math.min(last, v + 1));
          if (e.key === "ArrowLeft") setIndex((v) => Math.max(0, v - 1));
        }}
        className="relative mt-16 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ink-navy md:mt-20"
        style={{ ["--cw" as string]: "min(620px, 82vw)" }}
      >
        <div className="relative left-1/2 flex w-max items-stretch transition-transform duration-700 ease-calendly" style={{ gap: GAP, transform: `translateX(calc(${index} * (var(--cw) + ${GAP}px) * -1 - var(--cw) / 2))` }}>
          {PLATFORM.cards.map((card, i) => {
            const on = i === index;
            const live = card.status === "live";
            return (
              <article
                key={card.id}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${PLATFORM.cards.length}: ${card.name}`}
                onClick={() => setIndex(i)}
                className={`relative flex shrink-0 cursor-pointer overflow-hidden rounded-[32px] bg-paper/80 shadow-card backdrop-blur transition duration-700 ease-calendly sm:rounded-[40px] ${on ? "scale-100" : "scale-[0.88] opacity-60"}`}
                style={{ width: "var(--cw)" }}
              >
                <div className="relative z-10 flex flex-1 flex-col items-start gap-4 p-7 sm:p-9">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-paper shadow-product">
                    {card.icon === "star" ? <Star className="size-7 text-brand" strokeWidth={1.75} aria-hidden /> : <Icon name={card.icon} className="size-7 text-brand" />}
                  </span>
                  <h3 className="h-sub !text-[1.75rem]">{card.name}</h3>
                  <p className="max-w-[15rem] text-base sm:max-w-[18rem] leading-relaxed text-slate-gray">{card.text}</p>
                  {live && card.href ? (
                    <Link href={card.href} tabIndex={on ? 0 : -1} className="mt-auto inline-flex items-center gap-2 text-base font-medium text-brand">
                      Explore Catering <ArrowRight className="size-5" aria-hidden />
                    </Link>
                  ) : (
                    <span className="mt-auto inline-flex rounded-full bg-ink-navy/5 px-3.5 py-1.5 text-sm font-medium text-ink-navy">Coming soon</span>
                  )}
                </div>
                <div aria-hidden className={`cw-${card.colourway} absolute inset-y-0 right-0 w-[24%] rounded-l-[40px] opacity-90 sm:w-[40%] sm:rounded-l-[48px]`}>
                  <div className="bars absolute inset-x-0 top-[22%] h-[56%] opacity-40" />
                </div>
                {live && <span className="absolute right-5 top-5 z-10 rounded-full bg-paper px-3 py-1 text-sm font-medium shadow-card">Live now</span>}
              </article>
            );
          })}
        </div>
      </div>

      <div className="mt-12 flex items-center justify-center gap-2" role="group" aria-label="Choose a product">
        {PLATFORM.cards.map((card, i) => (
          <button key={card.id} type="button" aria-label={`Show ${card.name}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} className="flex h-6 items-center">
            <span className={`block h-2 overflow-hidden rounded-full transition-all duration-300 ${i === index ? "w-12 bg-ink-navy/20" : "w-2 bg-ink-navy/30"}`}>
              {i === index && !halted && <span key={`${i}-${index}`} className="block h-full w-full bg-ink-navy" style={{ transformOrigin: "left", animation: "fill 5s linear both" }} />}
              {i === index && halted && <span className="block h-full w-full bg-ink-navy" />}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

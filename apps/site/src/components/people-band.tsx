"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { PEOPLE } from "@/content/people";

const GAP = 40;

function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const motionReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The closing band. A warm aurora with a rounded top, a heading and one button, then a row of scenes: an illustrated
 * person standing in front of a coloured card, breaking over its top edge, with a state chip across the middle that
 * says what Platterly just did ("Order sent to kitchen"). The scene in the middle is full size, its neighbours are
 * smaller and sit lower, peeking in from the sides. It moves on every five seconds (not for people who ask for less
 * motion, and not while the pointer or focus is on it); the dots, arrow keys and a click on a neighbour move it too.
 */
export function PeopleBand({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = useSyncExternalStore(subscribeMotion, motionReduced, () => false);
  const last = PEOPLE.length - 1;

  useEffect(() => {
    if (paused || still) return;
    const timer = window.setTimeout(() => setIndex((v) => (v === last ? 0 : v + 1)), 5000);
    return () => window.clearTimeout(timer);
  }, [index, paused, still, last]);

  return (
    <section aria-labelledby="final" className="relative mt-24 overflow-x-clip rounded-t-[40px] pb-24 pt-20 md:mt-36 md:rounded-t-[56px] md:pb-32 md:pt-28" style={{ background: "var(--band-bg)" }}>
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 text-center">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="final" className="h-section">
          {title}
        </h2>
        <div className="flex flex-col items-center gap-6 text-lg leading-relaxed sm:text-xl">{children}</div>
      </Reveal>

      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Scenes from the kitchen"
        tabIndex={0}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setIndex((v) => Math.min(last, v + 1));
          if (e.key === "ArrowLeft") setIndex((v) => Math.max(0, v - 1));
        }}
        className="relative mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ink-navy md:mt-36"
        style={{ ["--sw" as string]: "min(620px, 74vw)" }}
      >
        <div className="relative left-1/2 flex w-max items-end transition-transform duration-700 ease-calendly" style={{ gap: GAP, transform: `translateX(calc(${index} * (var(--sw) + ${GAP}px) * -1 - var(--sw) / 2))` }}>
          {PEOPLE.map((scene, i) => {
            const on = i === index;
            return (
              <figure
                key={scene.photo}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${PEOPLE.length}: ${scene.chip}`}
                onClick={() => setIndex(i)}
                className={`relative aspect-[16/10] shrink-0 cursor-pointer transition duration-700 ease-calendly ${on ? "scale-100" : "origin-bottom scale-[0.82] opacity-80"}`}
                style={{ width: "var(--sw)" }}
              >
                <div className={`cw-${scene.colourway} absolute inset-0 overflow-hidden rounded-[28px] shadow-card sm:rounded-[36px]`}>
                  <div aria-hidden className="bars absolute inset-x-0 top-[22%] h-[56%]" />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/media/people/${scene.photo}.webp`} alt={scene.alt} loading={i < 2 ? "eager" : "lazy"} decoding="async" draggable={false} style={{ height: `${150 * (scene.scale ?? 1)}%` }} className="pointer-events-none absolute bottom-0 left-1/2 w-auto max-w-none -translate-x-1/2 select-none object-contain object-bottom" />
                <figcaption className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                  <span className="inline-flex items-center gap-3 rounded-[22px] bg-paper py-2.5 pl-2.5 pr-6 text-[clamp(1.125rem,2.2vw,1.75rem)] font-medium leading-none shadow-product">
                    <span className="flex size-11 items-center justify-center rounded-full bg-brand text-ink-navy sm:size-12">
                      <Icon name={scene.icon} className="size-6" />
                    </span>
                    {scene.chip}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      <div className="mt-12 flex items-center justify-center gap-2" role="group" aria-label="Choose a scene">
        {PEOPLE.map((scene, i) => (
          <button key={scene.photo} type="button" aria-label={`Show scene ${i + 1}: ${scene.chip}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} className="flex h-6 items-center">
            <span className={`block h-2 overflow-hidden rounded-full transition-all duration-300 ${i === index ? "w-12 bg-ink-navy/20" : "w-2 bg-ink-navy/30"}`}>
              {i === index && !still && !paused && <span key={`${i}-${index}`} className="block h-full w-full bg-ink-navy" style={{ transformOrigin: "left", animation: "fill 5s linear both" }} />}
              {i === index && (still || paused) && <span className="block h-full w-full bg-ink-navy" />}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

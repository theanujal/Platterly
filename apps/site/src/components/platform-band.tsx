import Link from "next/link";
import { ArrowRight, Layers, Plus, Star } from "lucide-react";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { ButtonLinkInline } from "@/components/platform-link";
import { PLATFORM, type PlatformCard } from "@/content/platform";

/** The mark for one product: Caterly's own logo, a star for Rivo, a stack for what is not named yet. */
function Mark({ card, size }: { card: PlatformCard; size: "tile" | "small" }) {
  const box = size === "tile" ? "size-7" : "size-9";
  if (card.id === "catering")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/caterly-mark.png" alt="" width={96} height={96} className={`${box} rounded-lg`} />;
  if (card.icon === "star") return <Star className={`${size === "tile" ? "size-6" : "size-6"} text-brand`} strokeWidth={1.75} aria-hidden />;
  if (card.icon === "layers") return <Layers className={`${size === "tile" ? "size-6" : "size-6"} text-ink-navy`} strokeWidth={1.75} aria-hidden />;
  return <Icon name={card.icon} className="size-7 text-brand" />;
}

/**
 * The home page's platform section, after calendly.com's integrations band: a label, a big heading, one line and a link,
 * a row of rounded tiles (one for each product, then empty places for the ones still to come),
 * and a card for each product. Only the live product links anywhere. Nothing moves by itself.
 */
export function PlatformBand() {
  const tiles = [...PLATFORM.cards, null, null];
  return (
    <section aria-labelledby="platform" className="mx-auto w-full max-w-[1328px] px-5 py-16 sm:px-8 md:py-24">
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <p className="eyebrow">{PLATFORM.eyebrow}</p>
        <h2 id="platform" className="h-section">
          {PLATFORM.title} {PLATFORM.accent}
        </h2>
        <p className="text-lg leading-relaxed text-slate-gray sm:text-xl">{PLATFORM.copy}</p>
        <ButtonLinkInline href="/caterly/">Explore Caterly</ButtonLinkInline>
      </Reveal>

      <Reveal delay={80} className="mt-14 md:mt-16">
        <ul aria-label="Platterly products" className="flex flex-wrap items-center justify-center gap-y-3">
          {tiles.map((card, i) => (
            <li key={card?.id ?? `empty-${i}`} className="flex items-center">
              {i > 0 && <span aria-hidden className="h-0.5 w-4 bg-brand/25 sm:w-6" />}
              <span className={`flex size-10 items-center justify-center rounded-xl sm:size-11 sm:rounded-[14px] ${card ? "bg-badge-fill ring-1 ring-brand/10" : "border-2 border-dashed border-ink-navy/20 text-ink-navy/40"}`} title={card ? card.name : "More products are on the way"}>
                {card ? <Mark card={card} size="tile" /> : <Plus className="size-4" aria-hidden />}
                {card && <span className="sr-only">{card.name}</span>}
                {!card && <span className="sr-only">More products are on the way</span>}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      <ul className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3">
        {PLATFORM.cards.map((card, i) => {
          const live = card.status === "live" && card.href;
          return (
            <Reveal as="li" key={card.id} delay={i * 80} className="flex flex-col rounded-[32px] bg-paper p-7 shadow-product ring-1 ring-ink-navy/5">
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-badge-fill">
                  <Mark card={card} size="small" />
                </span>
                {live ? (
                  <Link href={card.href!} aria-label={`Explore ${card.name}`} className="flex size-9 items-center justify-center rounded-lg bg-badge-fill transition-colors duration-150 hover:bg-sky">
                    <ArrowRight className="size-4 -rotate-45" aria-hidden />
                  </Link>
                ) : (
                  <span className="rounded-full bg-badge-fill px-3 py-1 text-sm font-medium">Coming soon</span>
                )}
              </div>
              <h3 className="h-sub mt-8 !text-[1.75rem]">{card.name}</h3>
              <p className="mt-3 text-base leading-relaxed text-slate-gray sm:text-lg">{card.text}</p>
              {live && <p className="mt-5 inline-flex w-fit rounded-full bg-sky px-3 py-1 text-sm font-medium">Live now</p>}
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

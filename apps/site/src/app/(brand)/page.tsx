import type { Metadata } from "next";
import { ArrowRight } from "@/components/icons";
import { HomeBlog } from "@/components/home-blog";
import { TrustStrip } from "@/components/trust-strip";
import { ProductChapter } from "@/components/product-chapter";
import { ClosingBand } from "@/components/closing-band";
import { PlatformBand } from "@/components/platform-band";
import { ProductScene } from "@/components/product-scene";
import { UiCard } from "@/components/ui-cards";
import { Voices } from "@/components/proof";
import { Reveal } from "@/components/reveal";
import { StepCards } from "@/components/step-cards";
import { ButtonLink, Panel } from "@/components/ui";
import { HOME, HOME_CHAPTER, HOME_SCENE, HOME_STEPS } from "@/content/home";
import { CATERING_PRODUCT } from "@/content/products";
import { pageLinks, SITE, TESTIMONIALS } from "@/content/site";
import { getPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: { absolute: "Platterly | Software built for the food business" },
  description: SITE.description,
  ...pageLinks("/"),
};

const d = (n: number) => ({ "--d": `${n}ms` }) as React.CSSProperties;

export default async function HomePage() {
  const posts = await getPosts();
  return (
    <>
      {/* 01 The hero panel (the gradient) holds the headline and the product scene; the four steps follow in a linen panel */}
      <Panel label="hero" tone="aurora" className="pb-10 pt-28 md:pb-24 md:pt-40">
        <div className="px-4 text-center sm:px-10">
          <h1 id="hero" style={d(0)} className="h-display enter mx-auto max-w-4xl">
            {HOME.hero.title}
          </h1>
          <p style={d(120)} className="enter mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-navy sm:text-xl">
            {HOME.hero.copy}
          </p>
          <div style={d(240)} className="enter mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
            <ButtonLink href="/caterly" variant="outline">
              Explore Caterly <ArrowRight className="size-5" aria-hidden />
            </ButtonLink>
          </div>
          <p style={d(320)} className="enter mt-4 text-sm text-ink-navy">
            Starting with Caterly, more products on the way.
          </p>
        </div>
        <div style={d(440)} className="enter mt-12 md:mt-14">
          <ProductScene product={CATERING_PRODUCT} title={HOME_SCENE.title} text={HOME_SCENE.text} visual={<UiCard name="orders" size="md" />} />
        </div>
      </Panel>

      <Panel label="steps" tone="none">
        <div className="mx-auto max-w-[1328px] px-4 pb-6 pt-24 sm:px-10 sm:pt-32">
          <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <p className="eyebrow">{HOME_STEPS.eyebrow}</p>
            <h2 id="steps" className="h-section">
              {HOME_STEPS.title}
            </h2>
            <p className="text-lg leading-relaxed text-slate-gray sm:text-xl">{HOME_STEPS.copy}</p>
            <ButtonLink href={SITE.appUrl}>Start for free</ButtonLink>
          </Reveal>
          <StepCards steps={HOME_STEPS.steps} />
        </div>
      </Panel>

      {/* 02 The chapter dedicated to Catering, as calendly.com has one for Scheduling */}
      <div className="py-8 md:py-16">
        <ProductChapter id="catering-chapter" label={HOME_CHAPTER.label} product={CATERING_PRODUCT} title={HOME_CHAPTER.title} subtitle={HOME_CHAPTER.subtitle} items={HOME_CHAPTER.items} href="/caterly/" cta="Explore Caterly" screen="orders" />
      </div>

      <HomeBlog posts={posts} />

      <TrustStrip />

      <Voices items={TESTIMONIALS} />

      {/* 03 Closing band: where Platterly is today and what is next in line */}
      <PlatformBand />

      {/* 04 The closing call to action: the Caterly page's band, with wording that belongs to Platterly, not to one product */}
      <ClosingBand eyebrow="Get started" title="Let's make running your food business simpler.">
        <p className="text-slate-gray">Platterly builds simple software for food businesses. Get started for free, or talk to us and we will show you around.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href={SITE.appUrl}>
            Get started for free <ArrowRight className="size-5" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/talk-to-us/" variant="outline">
            Talk to us
          </ButtonLink>
        </div>
      </ClosingBand>
    </>
  );
}

import type { Metadata } from "next";
import { ArrowRight } from "@/components/icons";
import { FeatureShowcase } from "@/components/feature-showcase";
import { PeopleBand } from "@/components/people-band";
import { ProductScene } from "@/components/product-scene";
import { UiCard } from "@/components/ui-cards";
import { Voices } from "@/components/proof";
import { Reveal } from "@/components/reveal";
import { StepCards } from "@/components/step-cards";
import { ButtonLink, Panel } from "@/components/ui";
import { HOME, HOME_CHAPTER, HOME_SCENE, HOME_STEPS } from "@/content/home";
import { CATERING_PRODUCT } from "@/content/products";
import { SITE, TESTIMONIALS } from "@/content/site";

export const metadata: Metadata = {
  title: { absolute: "Platterly | Software built for the food business" },
  description: SITE.description,
  alternates: { canonical: "/" },
};

const d = (n: number) => ({ "--d": `${n}ms` }) as React.CSSProperties;

export default function HomePage() {
  return (
    <>
      {/* 01 One linen panel holds the hero, the product scene (which pins and grows as you scroll) and the four steps */}
      <Panel label="hero" className="pt-16 md:pt-28">
        <div className="px-4 text-center sm:px-10">
          <h1 id="hero" style={d(0)} className="h-display enter mx-auto max-w-4xl">
            {HOME.hero.title}
          </h1>
          <p style={d(120)} className="enter mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-gray sm:text-xl">
            {HOME.hero.copy}
          </p>
          <div style={d(240)} className="enter mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
            <ButtonLink href="/catering" variant="outline">
              Explore Catering <ArrowRight className="size-5" aria-hidden />
            </ButtonLink>
          </div>
          <p style={d(320)} className="enter mt-4 text-sm text-slate-gray">
            Starting with Catering, more products on the way.
          </p>
        </div>
        <div style={d(440)} className="enter-pop mt-12 md:mt-16">
          <ProductScene product={CATERING_PRODUCT} title={HOME_SCENE.title} text={HOME_SCENE.text} visual={<UiCard name="orders" size="md" />} />
        </div>

        <div className="mx-auto max-w-[1200px] px-4 pb-6 pt-24 sm:px-10 sm:pt-32">
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
        <FeatureShowcase id="catering-chapter" label={HOME_CHAPTER.label} product={CATERING_PRODUCT} title={HOME_CHAPTER.title} subtitle={HOME_CHAPTER.subtitle} items={HOME_CHAPTER.items} />
      </div>

      <Voices items={TESTIMONIALS} />

      {/* 03 Closing band: a heading, a line, one button, then the scenes */}
      <PeopleBand eyebrow="Get started" title="From the first enquiry to the final delivery">
        <p className="text-slate-gray">{HOME.direction.copy}</p>
        <ButtonLink href={SITE.appUrl}>Start for free</ButtonLink>
      </PeopleBand>
    </>
  );
}

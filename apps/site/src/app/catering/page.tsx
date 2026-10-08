import type { Metadata } from "next";
import { ArrowRight, Check, Icon } from "@/components/icons";
import { FeatureShowcase } from "@/components/feature-showcase";
import { Faq } from "@/components/faq";
import { JsonLd } from "@/components/json-ld";
import { HowSteps } from "@/components/how-steps";
import { ProductTile } from "@/components/product-tile";
import { Voices } from "@/components/proof";
import { Reveal } from "@/components/reveal";
import { PeopleBand } from "@/components/people-band";
import { Badge, ButtonLink, Panel } from "@/components/ui";
import { CATERING, PRICING } from "@/content/catering";
import { CATERING_PRODUCT, productVars } from "@/content/products";
import { SITE, TESTIMONIALS } from "@/content/site";

export const metadata: Metadata = {
  title: "Catering by Platterly | Software for catering businesses",
  description: "Run your catering business without the chaos. Customers, events, menus, orders, kitchen, delivery and payments in one workflow. Start free for 7 days.",
  alternates: { canonical: "/catering/" },
};

export default function CateringPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: CATERING.faq.items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Catering by Platterly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE.url}/catering/`,
    description: CATERING.hero.copy,
    offers: [
      { "@type": "Offer", name: "Free Trial", price: "0", priceCurrency: "INR" },
      { "@type": "Offer", name: "Premium (monthly)", price: "3000", priceCurrency: "INR" },
    ],
  };

  const d = (n: number) => ({ "--d": `${n}ms` }) as React.CSSProperties;

  return (
    <>
      <JsonLd data={appLd} />
      <JsonLd data={faqLd} />

      {/* 01 Hero: a full-width gradient panel and nothing else, like calendly.com's product pages: the product's tile and name, one headline, two buttons */}
      <section aria-labelledby="hero" className="px-3 sm:px-6">
        <div className="relative isolate flex min-h-[calc(100vh-108px)] flex-col items-center justify-center overflow-hidden rounded-[28px] px-5 py-24 text-center sm:rounded-[40px]" style={{ background: "var(--aurora)", ...productVars(CATERING_PRODUCT) }}>
          <p style={d(0)} className="enter inline-flex items-center gap-3 text-xl font-medium">
            <ProductTile product={CATERING_PRODUCT} className="size-9" iconClass="size-5" />
            Catering by Platterly
          </p>
          <h1 id="hero" style={d(80)} className="h-display enter mx-auto mt-6 max-w-4xl">
            {CATERING.hero.title}
          </h1>
          <p style={d(180)} className="enter mx-auto mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl">
            {CATERING.hero.copy}
          </p>
          <div style={d(280)} className="enter mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="#pricing">See plans</ButtonLink>
            <ButtonLink href="/talk-to-us/" variant="outline">Book a demo</ButtonLink>
          </div>
          <p style={d(340)} className="enter mt-4 text-sm">
            Free for 7 days • No credit card required
          </p>
        </div>
      </section>

      {/* 02 Features: a long list beside a gradient panel with the real screen */}
      <div id="features" className="py-8 md:py-16">
        <FeatureShowcase id="features-title" label="Catering" product={CATERING_PRODUCT} title={CATERING.features.title} items={CATERING.features.groups} />
      </div>

      {/* 03 How it works: a sideways row of coloured cards, each a small designed version of one screen */}
      <section aria-labelledby="how" className="py-16 md:py-24">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 text-center">
          <p className="eyebrow">How it works</p>
          <h2 id="how" className="h-section">
            Easy and flexible catering management
          </h2>
        </Reveal>
        <div className="mt-14">
          <HowSteps steps={CATERING.howSteps} />
        </div>
      </section>

      {/* 04 The day itself */}
      <div className="py-8 md:py-16">
        <FeatureShowcase id="chapters" label="Kitchen and delivery" product={CATERING_PRODUCT} title={CATERING.chapters.title} items={CATERING.chapters.items} flip />
      </div>

      <Voices items={TESTIMONIALS} />

      {/* 05 Use cases */}
      <section aria-labelledby="usecases" className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8 md:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 id="usecases" className="h-section">
            {CATERING.useCases.title}
          </h2>
        </Reveal>
        <Reveal as="ul" className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATERING.useCases.items.map((item, index) => (
            <li key={item.title} style={d(index * 100)} className="rv-child lift flex min-h-64 flex-col gap-4 rounded-[28px] p-8 hover:shadow-product" >
              <span style={productVars(CATERING_PRODUCT)} className="flex size-12 items-center justify-center rounded-xl bg-product text-ink-navy">
                <Icon name={["calendar", "users", "book", "truck"][index]} className="size-6" />
              </span>
              <h3 className="h-sub !text-2xl">{item.title}</h3>
              <p className="text-base leading-relaxed text-slate-gray">{item.text}</p>
            </li>
          ))}
        </Reveal>
      </section>

      {/* 07 Pricing */}
      <Panel label="pricing-title" id="pricing" className="px-4 py-20 sm:px-10 md:py-28">
        <div className="mx-auto max-w-[1200px]">
          <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <h2 id="pricing-title" className="h-section">
              Simple plans for growing caterers
            </h2>
            <p className="text-lg text-slate-gray">{PRICING.note}</p>
          </Reveal>
          <div className="mx-auto mt-14 grid max-w-4xl gap-4 md:grid-cols-2">
            {PRICING.plans.map((plan, index) => (
              <Reveal key={plan.name} delay={index * 120} className="flex">
                <div className={`lift flex w-full flex-col gap-5 rounded-[28px] bg-paper p-8 hover:shadow-product ${plan.featured ? "ring-2 ring-brand" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="h-sub !text-2xl">{plan.name}</h3>
                    {plan.featured && <Badge>Most popular</Badge>}
                  </div>
                  <div>
                    <p className="flex items-baseline gap-2">
                      <span className="h-display !text-5xl">{plan.price}</span>
                      <span className="text-base text-slate-gray">{plan.per}</span>
                    </p>
                    {"yearly" in plan && <p className="mt-2 text-sm font-medium">{plan.yearly}</p>}
                  </div>
                  <p className="text-slate-gray">{plan.blurb}</p>
                  <ul className="flex flex-col gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-1 size-5 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href={SITE.appUrl} variant={plan.featured ? "primary" : "outline"} className="mt-auto">
                    {plan.cta}
                  </ButtonLink>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Panel>

      {/* 08 FAQ */}
      <section aria-labelledby="faq" className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8 md:py-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 id="faq" className="h-section">
            {CATERING.faq.title}
          </h2>
        </Reveal>
        <Reveal className="mt-14" delay={100}>
          <Faq items={CATERING.faq.items} />
        </Reveal>
      </section>

      {/* 09 The Platterly platform: the products, as on calendly.com's product pages */}
      <section aria-labelledby="platform" className="mx-auto w-full max-w-[1200px] px-5 pb-24 sm:px-8 md:pb-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 id="platform" className="h-section">
            The Platterly platform
          </h2>
        </Reveal>
        <Reveal as="ul" className="mt-12 grid gap-3 md:grid-cols-2">
          <li style={d(0)} className="rv-child lift flex items-center gap-5 rounded-[28px] bg-paper p-8 hover:shadow-product">
            <ProductTile product={CATERING_PRODUCT} className="size-14 !rounded-2xl" iconClass="size-7" />
            <div>
              <p className="h-sub !text-2xl">{CATERING_PRODUCT.name}</p>
              <p className="mt-1 text-slate-gray">{CATERING_PRODUCT.tagline}</p>
            </div>
          </li>
          <li style={d(100)} className="rv-child flex items-center gap-5 rounded-[28px] border-2 border-dashed border-ink-navy/20 p-8">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ink-navy/5 text-2xl text-slate-gray" aria-hidden>
              +
            </span>
            <div>
              <p className="h-sub !text-2xl">More on the way</p>
              <p className="mt-1 text-slate-gray">New products for food businesses will appear here.</p>
            </div>
          </li>
        </Reveal>
      </section>

      {/* 10 Closing band */}
      <PeopleBand eyebrow="Get started" title={CATERING.cta.title}>
        <p className="text-slate-gray">{CATERING.cta.copy}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href={SITE.appUrl}>
            Start for free <ArrowRight className="size-5" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/talk-to-us/" variant="outline">Book a demo</ButtonLink>
        </div>
      </PeopleBand>
    </>
  );
}

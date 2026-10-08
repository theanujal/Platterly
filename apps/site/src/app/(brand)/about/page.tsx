import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { ProductTile } from "@/components/product-tile";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import { CATERING_PRODUCT } from "@/content/products";
import { COMPANY, SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "About Platterly",
  description: "Platterly builds focused software for the work behind food businesses, starting with catering.",
  alternates: { canonical: "/about/" },
};

/** TODO(AJ): the story below is written from the product documents; replace it with your own words when you like. */
const PRINCIPLES = [
  { title: "Built around the real work", text: "We start from how a caterer actually works, from the first enquiry to the final delivery, and build the software to match, not the other way round." },
  { title: "Calm, clear and quick", text: "A busy kitchen has no time for clutter. Every screen should answer one question quickly: what is next, and who is it for?" },
  { title: "Honest about what we are", text: "We say what the product does today and what is still ahead. Nothing here is a promise we have not decided to keep." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About Platterly" title="Software for the work behind the food">
        <p>Platterly builds focused software for food businesses, starting with catering.</p>
      </PageHero>

      <section aria-labelledby="story" className="mx-auto w-full max-w-[1100px] px-5 py-24 sm:px-8 md:py-36">
        <Reveal>
          <p className="eyebrow">Our story</p>
          <h2 id="story" className="h-section mt-4 max-w-3xl">
            Food businesses run on a lot of moving parts. The people running them should not have to be the glue.
          </h2>
        </Reveal>
        <Reveal className="mt-10 grid gap-8 text-lg leading-relaxed text-slate-gray md:grid-cols-2 md:gap-14" delay={100}>
          <p>Customers, orders, menus, events, teams and deliveries. Too often those parts live in spreadsheets, messages and separate tools, and the person at the centre spends their day moving information from one to another.</p>
          <p>Platterly is being built to change that. We design software around the way food businesses really work, so that the order, the menu, the kitchen and the payment are one connected thing. We are starting with catering, where the stakes are highest and the handovers are the most fragile.</p>
        </Reveal>
      </section>

      <section aria-labelledby="build" className="px-3 sm:px-6">
        <div className="rounded-[28px] bg-pebble px-5 py-20 sm:rounded-[40px] sm:px-10 md:py-28">
          <div className="mx-auto max-w-[1100px]">
            <Reveal>
              <p className="eyebrow">What we build</p>
              <h2 id="build" className="h-section mt-4">
                One product today, more to come
              </h2>
            </Reveal>
            <Reveal className="mt-12 grid gap-4 md:grid-cols-2" delay={100}>
              <Link href="/catering/" className="lift flex items-center gap-5 rounded-[28px] bg-paper p-8 hover:shadow-product">
                <ProductTile product={CATERING_PRODUCT} className="size-14 !rounded-2xl" iconClass="size-7" />
                <span>
                  <span className="h-sub block !text-2xl">{CATERING_PRODUCT.name}</span>
                  <span className="mt-1 block text-slate-gray">{CATERING_PRODUCT.tagline}</span>
                </span>
              </Link>
              <div className="flex items-center gap-5 rounded-[28px] border-2 border-dashed border-ink-navy/20 p-8">
                <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ink-navy/5 text-2xl text-slate-gray">
                  +
                </span>
                <span>
                  <span className="h-sub block !text-2xl">More on the way</span>
                  <span className="mt-1 block text-slate-gray">
                    See <Link href="/upcoming/" className="underline underline-offset-4">what is coming</Link>.
                  </span>
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto w-full max-w-[1100px] px-5 py-24 sm:px-8 md:py-36">
        <Reveal>
          <h2 id="how" className="h-section">
            How we work
          </h2>
        </Reveal>
        <Reveal as="ul" className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} style={{ "--d": `${i * 100}ms` } as React.CSSProperties} className="rv-child border-t border-ink-navy/20 pt-6">
              <h3 className="h-sub">{p.title}</h3>
              <p className="mt-3 text-lg leading-relaxed text-slate-gray">{p.text}</p>
            </li>
          ))}
        </Reveal>
      </section>

      <section aria-labelledby="company" className="mx-auto w-full max-w-[1100px] px-5 pb-24 sm:px-8 md:pb-32">
        <div className="grid gap-10 rounded-[32px] bg-badge-fill p-8 sm:p-12 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 id="company" className="h-sub">
              The company
            </h2>
            <p className="mt-3 max-w-xl text-lg leading-relaxed text-slate-gray">
              Platterly is a product of {COMPANY.legalName}, {COMPANY.address}. Write to us at{" "}
              <a className="underline underline-offset-4" href={`mailto:${SITE.contactEmail}`}>
                {SITE.contactEmail}
              </a>{" "}
              or use the <Link className="underline underline-offset-4" href="/contact/">contact page</Link>.
            </p>
          </div>
          <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
        </div>
      </section>
    </>
  );
}

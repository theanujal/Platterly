import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import type { UpcomingStage } from "@/content/types";
import { getUpcoming } from "@/lib/content";

export const metadata: Metadata = {
  title: "Upcoming features",
  description: "What we are working towards in Platterly. Tell us what you need.",
  alternates: { canonical: "/upcoming/" },
};

const COLUMNS: { stage: UpcomingStage; title: string; empty: string; way: string }[] = [
  { stage: "planned", title: "Planned", empty: "Nothing planned that we can share yet.", way: "cw-blossom" },
  { stage: "in-progress", title: "In progress", empty: "Nothing to announce right now.", way: "cw-sunrise" },
  { stage: "beta", title: "In beta", empty: "No beta right now.", way: "cw-citrus" },
];

export default async function UpcomingPage() {
  const items = await getUpcoming();
  return (
    <>
      <PageHero eyebrow="Upcoming features" title="What we are working towards">
        <p>A short, honest list of what is next. We only list things we have decided to build.</p>
      </PageHero>
      <div className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8 md:py-28">
        <div className="grid gap-5 lg:grid-cols-3">
          {COLUMNS.map((col, ci) => {
            const list = items.filter((i) => i.stage === col.stage);
            return (
              <Reveal key={col.stage} delay={ci * 90} className="flex">
                <section aria-label={col.title} className="flex w-full flex-col gap-4 rounded-[32px] bg-pebble p-5">
                  <h2 className={`${col.way} rounded-2xl px-5 py-3 text-lg font-medium`}>
                    {col.title} <span className="text-sm font-normal">({list.length})</span>
                  </h2>
                  {list.length === 0 && <p className="px-2 py-4 text-slate-gray">{col.empty}</p>}
                  <ul className="flex flex-col gap-4">
                    {list.map((item) => (
                      <li key={item.id} className="rounded-[22px] bg-paper p-6 shadow-card">
                        <h3 className="text-xl font-medium">{item.title}</h3>
                        <p className="mt-2 leading-relaxed text-slate-gray">{item.text}</p>
                        {item.when && <p className="mt-3 text-sm text-slate-gray">{item.when}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-16 flex flex-col items-center gap-4 text-center">
          <h2 className="h-sub">Missing something you need?</h2>
          <p className="max-w-xl text-lg text-slate-gray">Tell us what would make your kitchen run better. It shapes what we build next.</p>
          <ButtonLink href="/contact/">Suggest a feature</ButtonLink>
        </Reveal>
      </div>
    </>
  );
}

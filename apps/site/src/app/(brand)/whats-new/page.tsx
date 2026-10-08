import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { formatDate, getReleases } from "@/lib/content";

export const metadata: Metadata = {
  title: "What's new",
  description: "What has shipped in Catering by Platterly, newest first.",
  alternates: { canonical: "/whats-new/" },
};

const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function WhatsNewPage() {
  const releases = await getReleases();
  const months = Array.from(new Set(releases.map((r) => month(r.date))));
  return (
    <>
      <PageHero eyebrow="What's new" title="What we have shipped">
        <p>Every improvement to Catering by Platterly, newest first. Only things that are live today.</p>
      </PageHero>
      <div className="mx-auto w-full max-w-[900px] px-5 py-20 sm:px-8 md:py-28">
        {months.map((m) => (
          <section key={m} aria-label={m} className="mb-16 last:mb-0">
            <h2 className="h-sub mb-8 border-b border-ink-navy/15 pb-4">{m}</h2>
            <ul className="flex flex-col gap-6">
              {releases
                .filter((r) => month(r.date) === m)
                .map((r, i) => (
                  <Reveal as="li" key={r.id} delay={i * 50}>
                    <article className="grid gap-4 rounded-[24px] bg-paper p-7 shadow-card sm:grid-cols-[9rem_1fr] sm:gap-8">
                      <p className="text-sm text-slate-gray">
                        <time dateTime={r.date}>{formatDate(r.date)}</time>
                        <span className={`mt-3 block w-fit rounded-full px-3 py-1 text-xs font-medium ${r.kind === "new" ? "bg-accent" : "bg-sky"}`}>{r.kind === "new" ? "New" : "Improved"}</span>
                      </p>
                      <div>
                        <h3 className="text-xl font-medium">{r.title}</h3>
                        <div className="prose-legal mt-2">
                          <Markdown>{r.body}</Markdown>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

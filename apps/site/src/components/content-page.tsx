import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import type { PageDoc } from "@/content/types";
import { formatDate } from "@/lib/content";
import { tableOfContents } from "@/lib/markdown-meta";

/**
 * A policy or information page: the gradient hero, a contents list that follows you down the page, the text, and a card
 * to ask us a question. The text is Markdown (src/content/pages/<slug>.md), so a lawyer or Platterly Ops can change it
 * without touching the layout.
 */
export function ContentPage({ page }: { page: PageDoc }) {
  const toc = tableOfContents(page.body);
  return (
    <>
      <PageHero title={page.title}>
        <p>{page.summary}</p>
        {page.updated && <p className="mt-3 text-sm">Last updated {formatDate(page.updated)}</p>}
      </PageHero>
      <div className="mx-auto grid w-full max-w-[1100px] gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-20">
        {toc.length > 2 && (
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="eyebrow mb-4 text-slate-gray">On this page</p>
              <ul className="flex flex-col gap-1 border-l border-ink-navy/15">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-slate-gray transition-colors duration-150 hover:border-ink-navy hover:text-ink-navy">
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        )}
        <Reveal as="article" className={`prose-legal ${toc.length > 2 ? "" : "lg:col-span-2 lg:mx-auto lg:max-w-3xl"}`}>
          <Markdown>{page.body}</Markdown>
        </Reveal>
      </div>
      <section aria-label="Questions" className="mx-auto w-full max-w-[1100px] px-5 pb-24 sm:px-8 md:pb-32">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-pebble p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <p className="h-sub">Questions about this page?</p>
            <p className="mt-2 text-slate-gray">Write to us and a person will reply.</p>
          </div>
          <ButtonLink href="/contact/">Contact us</ButtonLink>
        </div>
        <p className="mt-6 text-sm text-slate-gray">
          This page is a draft written for review by a lawyer before launch. See also our <Link className="underline underline-offset-4" href="/privacy/">Privacy Policy</Link>, <Link className="underline underline-offset-4" href="/terms/">Terms</Link> and <Link className="underline underline-offset-4" href="/refund/">Cancellation and Refund</Link> pages.
        </p>
      </section>
    </>
  );
}

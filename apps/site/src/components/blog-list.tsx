"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import type { PostDoc } from "@/content/types";

const ICON: Record<string, string> = { Planning: "calendar", Weddings: "calendar", Kitchen: "chef", Operations: "clipboard", Payments: "wallet" };
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The blog index: a tag filter, then a grid of cards whose covers use the page's gradient colourways. */
export function BlogList({ posts }: { posts: PostDoc[] }) {
  const tags = ["All", ...Array.from(new Set(posts.flatMap((p) => p.tags)))];
  const [tag, setTag] = useState("All");
  const shown = tag === "All" ? posts : posts.filter((p) => p.tags.includes(tag));
  return (
    <>
      <div role="group" aria-label="Filter posts by topic" className="mb-12 flex flex-wrap justify-center gap-2">
        {tags.map((t) => (
          <button key={t} type="button" aria-pressed={t === tag} onClick={() => setTag(t)} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ${t === tag ? "bg-ink-navy text-cloud" : "bg-ink-navy/5 hover:bg-ink-navy/10"}`}>
            {t}
          </button>
        ))}
      </div>
      <ul className="grid gap-6 md:grid-cols-2">
        {shown.map((post, i) => (
          <Reveal as="li" key={post.slug} delay={i * 70} className={i === 0 && tag === "All" ? "md:col-span-2" : ""}>
            <Link href={`/blog/${post.slug}/`} className="lift group flex h-full flex-col overflow-hidden rounded-[32px] bg-paper hover:shadow-product md:flex-row">
              <div className={`cw-${post.colourway} relative flex min-h-48 items-center justify-center md:min-h-64 ${i === 0 && tag === "All" ? "md:w-[46%]" : "md:w-[38%]"}`}>
                <span className="flex size-20 items-center justify-center rounded-[26px] bg-paper shadow-product">
                  <Icon name={ICON[post.tags[0]] ?? "book"} className="size-9 text-brand" />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-7 sm:p-9">
                <p className="text-sm text-slate-gray">
                  {post.tags.join(" · ")} · {post.readingMinutes} min read
                </p>
                <h2 className="h-sub mt-3 !text-[1.625rem] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{post.title}</h2>
                <p className="mt-3 flex-1 leading-relaxed text-slate-gray">{post.excerpt}</p>
                <p className="mt-6 text-sm text-slate-gray">
                  {post.author} · {date(post.date)}
                </p>
              </div>
            </Link>
          </Reveal>
        ))}
      </ul>
    </>
  );
}

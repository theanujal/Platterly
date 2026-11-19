import Link from "next/link";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import type { PostDoc } from "@/content/types";

const ICON: Record<string, string> = { Planning: "calendar", Weddings: "calendar", Kitchen: "chef", Operations: "clipboard", Payments: "wallet" };
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The home page's blog band: the three newest posts on gradient covers, and a button to the whole blog. Shows nothing when there are no posts. */
export function HomeBlog({ posts }: { posts: PostDoc[] }) {
  const latest = posts.slice(0, 3);
  if (latest.length === 0) return null;
  return (
    <section aria-labelledby="blog" className="mx-auto w-full max-w-[1328px] px-5 py-16 sm:px-8 md:py-20">
      <Reveal className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">From the blog</p>
          <h2 id="blog" className="h-section mt-3 !text-[2rem] sm:!text-[2.5rem]">
            Short reads for busy caterers
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-gray sm:text-lg">Practical ideas on planning events, working with the kitchen and getting paid.</p>
        </div>
        <ButtonLink href="/blog/" variant="outline">
          View all posts
        </ButtonLink>
      </Reveal>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {latest.map((post, i) => (
          <Reveal as="li" key={post.slug} delay={i * 80}>
            <Link href={`/blog/${post.slug}/`} className="lift group flex h-full flex-col overflow-hidden rounded-[28px] bg-paper shadow-product ring-1 ring-ink-navy/5">
              <div className={`cw-${post.colourway} flex h-44 items-center justify-center`}>
                <span className="flex size-16 items-center justify-center rounded-[22px] bg-paper shadow-product">
                  <Icon name={ICON[post.tags[0]] ?? "book"} className="size-7 text-brand" />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-sm text-slate-gray">
                  {post.tags.join(" · ")} · {post.readingMinutes} min read
                </p>
                <h3 className="h-sub mt-2 !text-[1.375rem]">{post.title}</h3>
                <p className="mt-2 flex-1 text-base leading-relaxed text-slate-gray">{post.excerpt}</p>
                <p className="mt-5 text-sm text-slate-gray">
                  {post.author} · {date(post.date)}
                </p>
              </div>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Markdown } from "@/components/markdown";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import { OPEN_GRAPH, SITE } from "@/content/site";
import type { PostDoc } from "@/content/types";
import { formatDate, getPost, getPosts } from "@/lib/content";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getPosts()).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt;
  const path = `/blog/${post.slug}/`;
  return { title, description, alternates: { canonical: path }, openGraph: { ...OPEN_GRAPH, url: path, type: "article", publishedTime: post.date, title, description, images: [{ url: postImage(post), ...(post.ogImage ? {} : { width: 1200, height: 630 }), alt: post.title }] } };
}

/** The post's sharing picture: an Ops upload, a full https address, or the site picture. */
const postImage = (post: PostDoc) => (post.ogImage ? (/^https:\/\//.test(post.ogImage) ? post.ogImage : `/uploads/${post.ogImage}`) : "/og.png");

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const related = (await getPosts()).filter((p) => p.slug !== post.slug).slice(0, 2);
  const url = `${SITE.url}/blog/${post.slug}/`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: [new URL(postImage(post), SITE.url).href],
    datePublished: post.date,
    // Posts carry no separate edit date, so the publish date stands in.
    dateModified: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "Platterly", url: SITE.url, logo: { "@type": "ImageObject", url: `${SITE.url}/platterly-logo.png` } },
    mainEntityOfPage: url,
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE.url}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE.url}/blog/` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };
  return (
    <>
      <JsonLd data={ld} />
      <JsonLd data={breadcrumbs} />
      <article>
        <header className="px-3 sm:px-6">
          <div className={`cw-${post.colourway} rounded-[28px] px-5 py-16 sm:rounded-[40px] md:py-24`}>
            <div className="mx-auto max-w-3xl">
              <Link href="/blog/" className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
                <ArrowLeft className="size-4" aria-hidden /> All posts
              </Link>
              <p className="mt-8 text-sm">{post.tags.join(" · ")}</p>
              <h1 className="h-hero mt-3 !tracking-[-0.02em]" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
                {post.title}
              </h1>
              <p className="mt-6 text-lg leading-relaxed sm:text-xl">{post.excerpt}</p>
              <p className="mt-6 text-sm">
                {post.author} · {formatDate(post.date)} · {post.readingMinutes} min read
              </p>
            </div>
          </div>
        </header>
        <Reveal className="prose-legal mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 md:py-24">
          <Markdown>{post.body}</Markdown>
        </Reveal>
      </article>
      <section aria-label="Try Caterly by Platterly" className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-pebble p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <p className="h-sub">Run your next event in one place</p>
            <p className="mt-2 text-slate-gray">Seven days free, no card needed.</p>
          </div>
          <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
        </div>
      </section>
      {related.length > 0 && (
        <section aria-labelledby="more" className="mx-auto w-full max-w-[1100px] px-5 py-24 sm:px-8 md:py-32">
          <h2 id="more" className="h-sub">
            Keep reading
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {related.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}/`} className="lift flex h-full flex-col rounded-[24px] bg-paper p-7 hover:shadow-product">
                  <span className="text-sm text-slate-gray">{p.tags.join(" · ")}</span>
                  <span className="h-sub mt-2 !text-2xl">{p.title}</span>
                  <span className="mt-2 text-slate-gray">{p.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

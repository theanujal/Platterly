import type { Metadata } from "next";
import { BlogList } from "@/components/blog-list";
import { PageHero } from "@/components/page-hero";
import { getPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Blog",
  description: "Practical ideas for running a catering business: planning events, working with the kitchen and getting paid.",
  alternates: { canonical: "/blog/", types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default async function BlogPage() {
  const posts = await getPosts();
  return (
    <>
      <PageHero eyebrow="Blog" title="Ideas for running a catering business">
        <p>Practical, short reads on planning events, working with the kitchen and getting paid.</p>
      </PageHero>
      <div className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8 md:py-28">
        <BlogList posts={posts} />
      </div>
    </>
  );
}

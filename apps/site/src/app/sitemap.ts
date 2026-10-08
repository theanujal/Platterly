import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";
import { getPosts } from "@/lib/content";

export const dynamic = "force-static";

const PAGES = ["", "catering", "about", "talk-to-us", "contact", "blog", "whats-new", "upcoming", "privacy", "terms", "refund", "cookie-policy", "shipping-and-delivery", "security"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  return [
    ...PAGES.map((path) => ({ url: `${SITE.url}/${path}${path ? "/" : ""}`, changeFrequency: "monthly" as const, priority: path === "" ? 1 : path === "catering" ? 0.9 : 0.5 })),
    ...posts.map((p) => ({ url: `${SITE.url}/blog/${p.slug}/`, lastModified: p.date, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}

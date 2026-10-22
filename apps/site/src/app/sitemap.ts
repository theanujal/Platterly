import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";
import { getPage, getPosts, getReleases } from "@/lib/content";

export const dynamic = "force-static";

/** Pages whose words live in the code, with the day their copy last changed. Update the date when you change a page's text. */
const CODE_PAGES: Record<string, string> = {
  "": "2026-10-12",
  catering: "2026-10-17",
  about: "2026-10-08",
  "talk-to-us": "2026-10-12",
  contact: "2026-10-12",
  upcoming: "2026-10-12",
};
/** Policy pages: their date is the "Last updated" the page itself shows. */
const POLICY_PAGES = ["privacy", "terms", "refund", "cookie-policy", "shipping-and-delivery", "security"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  const releases = await getReleases();
  const policies = await Promise.all(POLICY_PAGES.map(async (path): Promise<[string, string]> => [path, (await getPage(path)).updated]));
  const pages: [string, string | undefined][] = [...Object.entries(CODE_PAGES), ["blog", posts[0]?.date], ["whats-new", releases[0]?.date], ...policies];
  return [
    ...pages.map(([path, updated]) => ({
      url: `${SITE.url}/${path}${path ? "/" : ""}`,
      ...(updated ? { lastModified: updated } : {}),
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : path === "catering" ? 0.9 : 0.5,
    })),
    ...posts.map((p) => ({ url: `${SITE.url}/blog/${p.slug}/`, lastModified: p.date, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}

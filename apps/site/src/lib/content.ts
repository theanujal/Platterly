import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOTICE } from "@/content/notice";
import { RELEASES } from "@/content/releases";
import { CONTACT } from "@/content/site";
import type { Colourway, Notice, PageDoc, PostDoc, Release, UpcomingItem } from "@/content/types";
import { UPCOMING } from "@/content/upcoming";
import { parseFrontMatter, readingMinutes } from "@/lib/markdown-meta";

/**
 * The one place pages read their content from. The notice bar, contact details, What's new, the blog and the legal pages
 * are managed in Platterly Ops: when OPS_CONTENT_URL and SITE_SECRET are set, scripts/fetch-content.mjs fetches them before the
 * build (a failed fetch fails the build, so a deploy never goes out with silently stale text) and these functions read that
 * copy. When they are not set (local work, CI), the Markdown and TypeScript files in this repo are used. A section Ops has never been given falls back to
 * those files too. Every function is async for that reason.
 */
const PAGES_DIR = join(process.cwd(), "src", "content", "pages");
const POSTS_DIR = join(process.cwd(), "src", "content", "posts");

interface OpsBundle {
  version: number;
  notice: { enabled: boolean; text: string; linkLabel: string; linkHref: string } | null;
  contact: Contact | null;
  releases: Release[];
  posts: Omit<PostDoc, "readingMinutes">[];
  pages: PageDoc[];
}
export type Contact = typeof CONTACT;

/** The copy scripts/fetch-content.mjs saved before this build, or null when the build is using the files in this repo. */
let bundle: OpsBundle | null | undefined;
function readBundle(): OpsBundle | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "src", "content", ".ops", "bundle.json"), "utf8")) as OpsBundle;
  } catch {
    return null;
  }
}
const fromOps = async () => (bundle === undefined ? (bundle = readBundle()) : bundle);

export async function getNotice(): Promise<Notice | null> {
  const ops = (await fromOps())?.notice;
  if (ops) return ops.enabled && ops.text ? { enabled: true, text: ops.text, linkLabel: ops.linkLabel || undefined, linkHref: ops.linkHref || undefined } : null;
  return NOTICE.enabled ? NOTICE : null;
}

export async function getContact(): Promise<Contact> {
  return (await fromOps())?.contact ?? CONTACT;
}

export async function getPage(slug: string): Promise<PageDoc> {
  const managed = (await fromOps())?.pages.find((page) => page.slug === slug);
  if (managed) return managed;
  const { data, body } = parseFrontMatter(readFileSync(join(PAGES_DIR, `${slug}.md`), "utf8"));
  return { slug, title: data.title ?? slug, summary: data.summary ?? "", updated: data.updated ?? "", body };
}

export async function getPosts(): Promise<PostDoc[]> {
  const managed = (await fromOps())?.posts;
  if (managed) return managed.map((post) => ({ ...post, readingMinutes: readingMinutes(post.body) })).sort((a, b) => b.date.localeCompare(a.date));
  const posts = readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const { data, body } = parseFrontMatter(readFileSync(join(POSTS_DIR, file), "utf8"));
      return {
        slug,
        title: data.title ?? slug,
        excerpt: data.excerpt ?? "",
        date: data.date ?? "",
        author: data.author ?? "The Platterly team",
        tags: (data.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
        colourway: (data.colourway as Colourway) ?? "sunrise",
        body,
        readingMinutes: readingMinutes(body),
      } satisfies PostDoc;
    });
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPost(slug: string): Promise<PostDoc | null> {
  return (await getPosts()).find((post) => post.slug === slug) ?? null;
}

export async function getReleases(): Promise<Release[]> {
  return [...((await fromOps())?.releases ?? RELEASES)].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getUpcoming(): Promise<UpcomingItem[]> {
  return UPCOMING;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

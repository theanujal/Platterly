import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOTICE } from "@/content/notice";
import { RELEASES } from "@/content/releases";
import type { Colourway, Notice, PageDoc, PostDoc, Release, UpcomingItem } from "@/content/types";
import { UPCOMING } from "@/content/upcoming";
import { parseFrontMatter, readingMinutes } from "@/lib/markdown-meta";

/**
 * The one place pages read their content from. Today it reads Markdown and TypeScript files in this repo; when Platterly
 * Ops manages the content, these same functions call Ops instead and no page has to change. Every function is async for
 * that reason.
 */
const PAGES_DIR = join(process.cwd(), "src", "content", "pages");
const POSTS_DIR = join(process.cwd(), "src", "content", "posts");

export async function getNotice(): Promise<Notice | null> {
  return NOTICE.enabled ? NOTICE : null;
}

export async function getPage(slug: string): Promise<PageDoc> {
  const { data, body } = parseFrontMatter(readFileSync(join(PAGES_DIR, `${slug}.md`), "utf8"));
  return { slug, title: data.title ?? slug, summary: data.summary ?? "", updated: data.updated ?? "", body };
}

export async function getPosts(): Promise<PostDoc[]> {
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
  return [...RELEASES].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getUpcoming(): Promise<UpcomingItem[]> {
  return UPCOMING;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

import "server-only";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { COLOURWAYS, LEGAL_SLUGS, RELEASE_KINDS, SITE_LIMITS } from "./limits";
import { isMediaName } from "./media";

/**
 * The text of the marketing site (platterly.in), kept in ops. The site reads it at build time through /api/site/content;
 * nothing changes on the live site until someone presses Publish (see publish.ts). Every save marks the content "changed" so
 * the screen can say there is something to publish.
 */
export class SiteContentError extends Error {}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function required(value: string, label: string, max: number): string {
  const text = value.trim();
  if (!text) throw new SiteContentError(`${label} is required.`);
  if (text.length > max) throw new SiteContentError(`${label} can be at most ${max} characters.`);
  return text;
}
function optional(value: string, label: string, max: number): string {
  const text = value.trim();
  if (text.length > max) throw new SiteContentError(`${label} can be at most ${max} characters.`);
  return text;
}
function isoDay(value: string, label: string): string {
  const text = value.trim();
  if (!ISO_DAY.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new SiteContentError(`${label} must be a date.`);
  return text;
}
function slug(value: string): string {
  const text = value.trim().toLowerCase();
  if (!SLUG.test(text) || text.length > 100) throw new SiteContentError("The address can use lower-case letters, numbers and hyphens only.");
  return text;
}
/** A link on the site: a page inside it ("/catering/") or a secure outside address. */
function link(value: string, label: string): string {
  const text = optional(value, label, SITE_LIMITS.noticeLinkHref);
  if (text && !/^(\/(?!\/)|https:\/\/)/.test(text)) throw new SiteContentError(`${label} must start with / (a page on the site) or https://.`);
  return text;
}

async function touch(): Promise<void> {
  const now = new Date().toISOString();
  await prisma.siteSetting.upsert({ where: { key: "changed" }, create: { key: "changed", value: { at: now } }, update: { value: { at: now } } });
}

// ---- Notice bar ----
export interface SiteNotice {
  enabled: boolean;
  text: string;
  linkLabel: string;
  linkHref: string;
}
export const EMPTY_NOTICE: SiteNotice = { enabled: false, text: "", linkLabel: "", linkHref: "" };

export function cleanNotice(input: SiteNotice): SiteNotice {
  const text = optional(input.text, "Message", SITE_LIMITS.noticeText);
  const linkLabel = optional(input.linkLabel, "Link label", SITE_LIMITS.noticeLinkLabel);
  const linkHref = link(input.linkHref, "Link address");
  if (input.enabled && !text) throw new SiteContentError("Add a message before switching the bar on.");
  if (linkLabel && !linkHref) throw new SiteContentError("Add an address for the link, or clear its label.");
  if (linkHref && !linkLabel) throw new SiteContentError("Add a label for the link, or clear its address.");
  return { enabled: input.enabled, text, linkLabel, linkHref };
}
export async function getSiteNotice(): Promise<SiteNotice> {
  const row = await prisma.siteSetting.findUnique({ where: { key: "notice" } });
  return row ? { ...EMPTY_NOTICE, ...(row.value as Partial<SiteNotice>) } : EMPTY_NOTICE;
}
export async function saveSiteNotice(input: SiteNotice, staffId: string | null): Promise<SiteNotice> {
  const value = cleanNotice(input);
  await prisma.siteSetting.upsert({ where: { key: "notice" }, create: { key: "notice", value: { ...value } }, update: { value: { ...value } } });
  await touch();
  await audit({ actorUserId: staffId, action: "site.notice.saved", subject: "notice", detail: { enabled: value.enabled, text: value.text } });
  return value;
}

// ---- Contact information ----
export interface SiteContact {
  email: string;
  phone: string;
  whatsapp: string;
  hours: string[];
  addressLines: string[];
  reply: string;
}
export const EMPTY_CONTACT: SiteContact = { email: "", phone: "", whatsapp: "", hours: [], addressLines: [], reply: "" };

const lines = (text: string, label: string, max: number) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => required(l, label, max));

export function cleanContact(input: { email: string; phone: string; whatsapp: string; hours: string; addressLines: string; reply: string }): SiteContact {
  const email = required(input.email, "Email", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new SiteContentError("Enter a valid email address.");
  const phone = optional(input.phone, "Phone", 30);
  const whatsapp = optional(input.whatsapp, "WhatsApp", 30);
  for (const [label, value] of [["Phone", phone], ["WhatsApp", whatsapp]] as const) {
    if (value && (!/^[\d+\-()\s]+$/.test(value) || value.replace(/\D/g, "").length < 8)) throw new SiteContentError(`${label} must be a phone number.`);
  }
  return {
    email, phone, whatsapp,
    hours: lines(input.hours, "Opening hours", 80),
    addressLines: lines(input.addressLines, "Address", 120),
    reply: optional(input.reply, "Reply time", SITE_LIMITS.reply),
  };
}
export async function getSiteContact(): Promise<SiteContact> {
  const row = await prisma.siteSetting.findUnique({ where: { key: "contact" } });
  return row ? { ...EMPTY_CONTACT, ...(row.value as Partial<SiteContact>) } : EMPTY_CONTACT;
}
export async function saveSiteContact(input: Parameters<typeof cleanContact>[0], staffId: string | null): Promise<SiteContact> {
  const value = cleanContact(input);
  await prisma.siteSetting.upsert({ where: { key: "contact" }, create: { key: "contact", value: { ...value } }, update: { value: { ...value } } });
  await touch();
  await audit({ actorUserId: staffId, action: "site.contact.saved", subject: "contact" });
  return value;
}

// ---- What's new ----
export interface ReleaseInput {
  id: string;
  date: string;
  title: string;
  body: string;
  kind: string;
}
export function cleanRelease(input: ReleaseInput) {
  const kind = input.kind.trim();
  if (!(RELEASE_KINDS as readonly string[]).includes(kind)) throw new SiteContentError("Choose New or Improved.");
  return { id: slug(input.id), date: isoDay(input.date, "Date"), title: required(input.title, "Title", SITE_LIMITS.title), body: required(input.body, "Text", SITE_LIMITS.releaseBody), kind };
}
export const listSiteReleases = () => prisma.siteRelease.findMany({ orderBy: [{ date: "desc" }, { id: "asc" }] });
export async function saveSiteRelease(input: ReleaseInput, staffId: string | null) {
  const data = cleanRelease(input);
  const { id, ...rest } = data;
  const row = await prisma.siteRelease.upsert({ where: { id }, create: data, update: rest });
  await touch();
  await audit({ actorUserId: staffId, action: "site.release.saved", subject: id, detail: { title: data.title } });
  return row;
}
export async function deleteSiteRelease(id: string, staffId: string | null) {
  await prisma.siteRelease.deleteMany({ where: { id } });
  await touch();
  await audit({ actorUserId: staffId, action: "site.release.deleted", subject: id });
}

// ---- Blog posts (their categories are the tags) ----
export interface PostInput {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  tags: string;
  colourway: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  /** A library picture (its file name or /uploads/<name>) or an https address; empty for none. */
  ogImage: string;
  status: string;
  /** "YYYY-MM-DDTHH:mm" in India time, or empty for "as soon as it is published". */
  publishAt: string;
}

/** Share image: a picture in the library (stored as its file name), an https address, or nothing. */
function shareImage(value: string): string | null {
  const text = value.trim().replace(/^\/uploads\//, "");
  if (!text) return null;
  if (/^https:\/\//.test(text)) { if (text.length > 500) throw new SiteContentError("The share image address is too long."); return text; }
  if (!isMediaName(text)) throw new SiteContentError("The share image must be a picture from the library or an https:// address.");
  return text;
}
function scheduledAt(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? new Date(`${text}:00+05:30`) : new Date(Number.NaN);
  if (Number.isNaN(at.getTime())) throw new SiteContentError("Publish date and time must be a date and a time.");
  return at;
}

export function cleanPost(input: PostInput) {
  const colourway = input.colourway.trim();
  if (!(COLOURWAYS as readonly string[]).includes(colourway)) throw new SiteContentError("Choose one of the colour styles.");
  const tags = [...new Set(input.tags.split(",").map((t) => t.trim()).filter(Boolean))].map((t) => required(t, "Category", SITE_LIMITS.tag));
  if (tags.length > 6) throw new SiteContentError("Use at most 6 categories.");
  return {
    slug: slug(input.slug), title: required(input.title, "Title", SITE_LIMITS.title), excerpt: required(input.excerpt, "Summary", SITE_LIMITS.excerpt),
    date: isoDay(input.date, "Date"), author: required(input.author, "Author", SITE_LIMITS.author), tags, colourway, body: required(input.body, "Post text", SITE_LIMITS.postBody),
    metaTitle: optional(input.metaTitle, "Search title", SITE_LIMITS.metaTitle) || null,
    metaDescription: optional(input.metaDescription, "Search description", SITE_LIMITS.metaDescription) || null,
    ogImage: shareImage(input.ogImage),
    status: (() => { if (input.status !== "DRAFT" && input.status !== "PUBLISHED") throw new SiteContentError("Choose Draft or Published."); return input.status; })(),
    publishAt: scheduledAt(input.publishAt),
  };
}
export const listSitePosts = () => prisma.sitePost.findMany({ orderBy: [{ date: "desc" }, { slug: "asc" }] });
export const getSitePost = (postSlug: string) => prisma.sitePost.findUnique({ where: { slug: postSlug } });
export async function saveSitePost(input: PostInput, staffId: string | null) {
  const data = cleanPost(input);
  const { slug: key, ...rest } = data;
  const row = await prisma.sitePost.upsert({ where: { slug: key }, create: data, update: rest });
  await touch();
  await audit({ actorUserId: staffId, action: "site.post.saved", subject: key, detail: { title: data.title } });
  return row;
}
export async function deleteSitePost(postSlug: string, staffId: string | null) {
  await prisma.sitePost.deleteMany({ where: { slug: postSlug } });
  await touch();
  await audit({ actorUserId: staffId, action: "site.post.deleted", subject: postSlug });
}
/** Every category in use, with how many posts carry it. */
export async function postCategories(): Promise<{ tag: string; posts: number }[]> {
  const counts = new Map<string, number>();
  for (const post of await listSitePosts()) for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, posts]) => ({ tag, posts })).sort((a, b) => a.tag.localeCompare(b.tag));
}
/** Renames a category on every post that has it, or removes it when `to` is blank. */
export async function renameCategory(from: string, to: string, staffId: string | null): Promise<number> {
  const target = optional(to, "Category", SITE_LIMITS.tag);
  const posts = (await listSitePosts()).filter((p) => p.tags.includes(from));
  for (const post of posts) {
    const tags = [...new Set(post.tags.map((t) => (t === from ? target : t)).filter(Boolean))];
    await prisma.sitePost.update({ where: { slug: post.slug }, data: { tags } });
  }
  if (posts.length) await touch();
  await audit({ actorUserId: staffId, action: "site.category.renamed", subject: from, detail: { to: target, posts: posts.length } });
  return posts.length;
}

// ---- Legal pages ----
export interface LegalInput {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  body: string;
}
export function cleanLegal(input: LegalInput) {
  const key = input.slug.trim();
  if (!LEGAL_SLUGS.some((l) => l.slug === key)) throw new SiteContentError("Unknown page.");
  return { slug: key, title: required(input.title, "Title", SITE_LIMITS.title), summary: required(input.summary, "Summary", SITE_LIMITS.summary), updated: isoDay(input.updated, "Last updated"), body: required(input.body, "Page text", SITE_LIMITS.pageBody) };
}
export const listLegalPages = () => prisma.siteLegalPage.findMany();
export const getLegalPage = (pageSlug: string) => prisma.siteLegalPage.findUnique({ where: { slug: pageSlug } });
export async function saveLegalPage(input: LegalInput, staffId: string | null) {
  const data = cleanLegal(input);
  const { slug: key, ...rest } = data;
  const row = await prisma.siteLegalPage.upsert({ where: { slug: key }, create: data, update: rest });
  await touch();
  await audit({ actorUserId: staffId, action: "site.page.saved", subject: key, detail: { title: data.title, updated: data.updated } });
  return row;
}

// ---- What the site builds from ----
export interface SiteContentBundle {
  version: 1;
  generatedAt: string;
  notice: SiteNotice | null;
  contact: SiteContact | null;
  releases: { id: string; date: string; title: string; body: string; kind: string }[];
  posts: { slug: string; title: string; excerpt: string; date: string; author: string; tags: string[]; colourway: string; body: string; metaTitle: string | null; metaDescription: string | null; ogImage: string | null }[];
  /** The library's picture names. The site build copies the ones its content refers to. */
  media: string[];
  pages: { slug: string; title: string; summary: string; updated: string; body: string }[];
}

/** An empty section is sent as null/[] only when nothing was ever saved, so the site can tell "not set up" from "set empty". */
export async function buildBundle(now = new Date()): Promise<SiteContentBundle> {
  const [notice, contact, releases, allPosts, pages, media, noticeRow, contactRow] = await Promise.all([
    getSiteNotice(), getSiteContact(), listSiteReleases(), listSitePosts(), listLegalPages(), prisma.siteMedia.findMany({ select: { name: true } }),
    prisma.siteSetting.findUnique({ where: { key: "notice" } }), prisma.siteSetting.findUnique({ where: { key: "contact" } }),
  ]);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    notice: noticeRow ? notice : null,
    contact: contactRow ? contact : null,
    releases: releases.map(({ id, date, title, body, kind }) => ({ id, date, title, body, kind })),
    // A draft, or a post scheduled for later, is not in the bundle until it is due.
    posts: allPosts.filter((p) => p.status === "PUBLISHED" && (!p.publishAt || p.publishAt.getTime() <= now.getTime())).map(({ slug: s, title, excerpt, date, author, tags, colourway, body, metaTitle, metaDescription, ogImage }) => ({ slug: s, title, excerpt, date, author, tags, colourway, body, metaTitle, metaDescription, ogImage })),
    media: media.map((m) => m.name),
    pages: pages.map(({ slug: s, title, summary, updated, body }) => ({ slug: s, title, summary, updated, body })),
  };
}

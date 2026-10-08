import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * The website's picture library. Files are kept on the Ops server's disk (SITE_MEDIA_DIR, by default `.data/site-media` next
 * to the app; put it somewhere that is backed up). Content refers to a picture as `/uploads/<name>`; the site build copies the
 * pictures it needs from Ops (apps/site/scripts/fetch-content.mjs), so the live site never depends on Ops being up.
 */
export class MediaError extends Error {}

export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;
export const isMediaName = (name: string) => NAME.test(name) && !name.includes("..");

export const mediaDir = () => process.env.SITE_MEDIA_DIR || join(process.cwd(), ".data", "site-media");

/** What the file really is, from its first bytes (the browser's claim is not trusted). SVG is refused: it can carry scripts. */
export function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const is = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png" };
  if (is(0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (is(0x47, 0x49, 0x46, 0x38)) return { mime: "image/gif", ext: "gif" };
  if (is(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
}

const slug = (text: string) => text.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "picture";

export async function storeMedia(bytes: Uint8Array, originalName: string, staffId: string | null) {
  if (bytes.byteLength === 0) throw new MediaError("That file is empty.");
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new MediaError("Pictures can be at most 4 MB.");
  const type = sniffImage(bytes);
  if (!type) throw new MediaError("Use a PNG, JPG, GIF or WebP picture.");
  const name = `${randomBytes(4).toString("hex")}-${slug(originalName)}.${type.ext}`;
  await mkdir(mediaDir(), { recursive: true });
  await writeFile(join(mediaDir(), name), bytes);
  const row = await prisma.siteMedia.create({ data: { name, originalName: originalName.slice(0, 200), mime: type.mime, bytes: bytes.byteLength, uploadedBy: staffId } });
  await audit({ actorUserId: staffId, action: "site.media.uploaded", subject: name, detail: { bytes: bytes.byteLength } });
  return row;
}

export const listMedia = () => prisma.siteMedia.findMany({ orderBy: { createdAt: "desc" } });

/** The file and its type, or null when there is no such picture. */
export async function readMedia(name: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!isMediaName(name)) return null;
  const row = await prisma.siteMedia.findUnique({ where: { name } });
  if (!row) return null;
  try {
    return { bytes: await readFile(join(mediaDir(), name)), mime: row.mime };
  } catch {
    return null;
  }
}

/** Where a picture is used: post bodies, legal pages, updates and share images. */
export async function mediaUsage(name: string): Promise<string[]> {
  const link = `/uploads/${name}`;
  const [posts, pages, releases] = await Promise.all([
    prisma.sitePost.findMany({ where: { OR: [{ body: { contains: link } }, { ogImage: { in: [name, link] } }] }, select: { title: true } }),
    prisma.siteLegalPage.findMany({ where: { body: { contains: link } }, select: { title: true } }),
    prisma.siteRelease.findMany({ where: { body: { contains: link } }, select: { title: true } }),
  ]);
  return [...posts.map((p) => `Post: ${p.title}`), ...pages.map((p) => `Page: ${p.title}`), ...releases.map((r) => `Update: ${r.title}`)];
}

export async function updateMediaAlt(name: string, alt: string, staffId: string | null) {
  if (alt.length > 200) throw new MediaError("Alt text can be at most 200 characters.");
  await prisma.siteMedia.update({ where: { name }, data: { alt: alt.trim() } });
  await audit({ actorUserId: staffId, action: "site.media.alt", subject: name });
}

/** Deletes a picture nothing uses. A picture in use is refused, so a live page never loses its image. */
export async function deleteMedia(name: string, staffId: string | null) {
  if (!isMediaName(name)) throw new MediaError("Unknown picture.");
  const used = await mediaUsage(name);
  if (used.length > 0) throw new MediaError(`Still used by ${used.slice(0, 3).join(", ")}${used.length > 3 ? ` and ${used.length - 3} more` : ""}. Remove it there first.`);
  await prisma.siteMedia.deleteMany({ where: { name } });
  await rm(join(mediaDir(), name), { force: true });
  await audit({ actorUserId: staffId, action: "site.media.deleted", subject: name });
}

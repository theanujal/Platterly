import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_MEDIA_BYTES, MediaError, deleteMedia, isMediaName, listMedia, mediaUsage, readMedia, sniffImage, storeMedia, updateMediaAlt } from "../media";
import { SiteContentError, buildBundle, cleanPost, saveSitePost, type PostInput } from "../site-content";
import { publishDueScheduled } from "../publish";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const GIF = Buffer.from("GIF89a");

const post: PostInput = { slug: "mediatest-post", title: "T", excerpt: "E", date: "2026-10-09", author: "A", tags: "X", colourway: "sunrise", body: "Hi", metaTitle: "", metaDescription: "", ogImage: "", status: "PUBLISHED", publishAt: "" };
let dir = "";
let saved: { media: Awaited<ReturnType<typeof prisma.siteMedia.findMany>>; posts: Awaited<ReturnType<typeof prisma.sitePost.findMany>>; publishes: Awaited<ReturnType<typeof prisma.sitePublish.findMany>> };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ops-media-"));
  process.env.SITE_MEDIA_DIR = dir;
  saved = { media: await prisma.siteMedia.findMany(), posts: await prisma.sitePost.findMany(), publishes: await prisma.sitePublish.findMany() };
});
afterAll(async () => {
  await prisma.siteMedia.deleteMany();
  await prisma.sitePost.deleteMany();
  await prisma.sitePublish.deleteMany();
  await prisma.siteMedia.createMany({ data: saved.media });
  await prisma.sitePost.createMany({ data: saved.posts });
  await prisma.sitePublish.createMany({ data: saved.publishes });
  delete process.env.SITE_MEDIA_DIR;
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await prisma.siteMedia.deleteMany();
  await prisma.sitePost.deleteMany();
  await prisma.sitePublish.deleteMany();
  for (const f of await readdir(dir)) await rm(join(dir, f), { force: true });
});

describe("pictures", () => {
  it("recognises pictures by their bytes and refuses everything else", () => {
    expect(sniffImage(PNG)?.ext).toBe("png");
    expect(sniffImage(JPG)?.ext).toBe("jpg");
    expect(sniffImage(WEBP)?.ext).toBe("webp");
    expect(sniffImage(GIF)?.ext).toBe("gif");
    expect(sniffImage(Buffer.from("<svg onload='x'/>"))).toBeNull();
    expect(sniffImage(Buffer.from("MZ......"))).toBeNull();
    expect(["a.png", "0a1b-x_y.jpg"].every(isMediaName)).toBe(true);
    expect(["../a.png", "a/b.png", ".hidden", "A.PNG", "", "a..b/../c"].some(isMediaName)).toBe(false);
  });

  it("stores a picture on disk under a safe name, serves it back, and keeps its alt text", async () => {
    const row = await storeMedia(PNG, "My Kitchen (1).PNG", null);
    expect(row.name).toMatch(/^[0-9a-f]{8}-my-kitchen-1\.png$/);
    expect(row.mime).toBe("image/png");
    expect(await readdir(dir)).toEqual([row.name]);
    const file = await readMedia(row.name);
    expect(file?.mime).toBe("image/png");
    expect(file?.bytes.equals(PNG)).toBe(true);
    expect(await readMedia("../etc/passwd")).toBeNull();
    expect(await readMedia("0000-missing.png")).toBeNull();
    await updateMediaAlt(row.name, "  A kitchen  ", null);
    expect((await listMedia())[0].alt).toBe("A kitchen");
    await expect(updateMediaAlt(row.name, "x".repeat(201), null)).rejects.toThrow(MediaError);
  });

  it("refuses an empty file, an oversized one, and a file that is not a picture", async () => {
    await expect(storeMedia(Buffer.alloc(0), "a.png", null)).rejects.toThrow(/empty/);
    await expect(storeMedia(Buffer.concat([PNG, Buffer.alloc(MAX_MEDIA_BYTES)]), "a.png", null)).rejects.toThrow(/4 MB/);
    await expect(storeMedia(Buffer.from("<svg/>"), "a.png", null)).rejects.toThrow(/PNG, JPG, GIF or WebP/);
    expect(await listMedia()).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("will not delete a picture a post still uses, but deletes one nothing uses", async () => {
    const row = await storeMedia(PNG, "x.png", null);
    await saveSitePost({ ...post, body: `Text ![a](/uploads/${row.name}) more` }, null);
    expect(await mediaUsage(row.name)).toEqual(["Post: T"]);
    await expect(deleteMedia(row.name, null)).rejects.toThrow(/Still used by Post: T/);
    expect((await listMedia()).length).toBe(1);
    await saveSitePost({ ...post, body: "No picture now" }, null);
    await saveSitePost({ ...post, slug: "mediatest-og", ogImage: row.name }, null);
    expect((await mediaUsage(row.name)).length).toBe(1); // as a share picture
    await prisma.sitePost.deleteMany({ where: { slug: "mediatest-og" } });
    await deleteMedia(row.name, null);
    expect(await listMedia()).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("post details: search, sharing and publishing", () => {
  it("checks the new fields", () => {
    expect(cleanPost({ ...post, metaTitle: " Search ", metaDescription: " D ", ogImage: "/uploads/abc-x.png", status: "DRAFT", publishAt: "2026-12-01T09:30" })).toMatchObject({ metaTitle: "Search", metaDescription: "D", ogImage: "abc-x.png", status: "DRAFT", publishAt: new Date("2026-12-01T04:00:00Z") });
    expect(cleanPost({ ...post, ogImage: "https://example.com/a.png" }).ogImage).toBe("https://example.com/a.png");
    expect(cleanPost(post)).toMatchObject({ metaTitle: null, metaDescription: null, ogImage: null, publishAt: null });
    expect(() => cleanPost({ ...post, ogImage: "http://insecure.example/a.png" })).toThrow(SiteContentError);
    expect(() => cleanPost({ ...post, ogImage: "../x.png" })).toThrow(/share image/);
    expect(() => cleanPost({ ...post, status: "ARCHIVED" })).toThrow(/Draft or Published/);
    expect(() => cleanPost({ ...post, publishAt: "tomorrow" })).toThrow(/date and a time/);
    expect(() => cleanPost({ ...post, metaTitle: "x".repeat(71) })).toThrow(/at most 70/);
    expect(() => cleanPost({ ...post, metaDescription: "x".repeat(161) })).toThrow(/at most 160/);
  });

  it("keeps drafts and not-yet-due posts out of the site's content, and lists the library", async () => {
    const now = new Date("2026-10-15T10:00:00Z");
    await saveSitePost({ ...post, slug: "live" }, null);
    await saveSitePost({ ...post, slug: "draft", status: "DRAFT" }, null);
    await saveSitePost({ ...post, slug: "later", publishAt: "2026-10-20T09:00" }, null);
    await saveSitePost({ ...post, slug: "due", publishAt: "2026-10-10T09:00" }, null);
    const picture = await storeMedia(PNG, "p.png", null);
    const bundle = await buildBundle(now);
    expect(bundle.posts.map((p) => p.slug).sort()).toEqual(["due", "live"]);
    expect(bundle.media).toEqual([picture.name]);
    expect(bundle.posts[0]).toHaveProperty("metaTitle");
  });

  it("starts a publish when a scheduled post comes due, once", async () => {
    const original = { secret: process.env.SITE_SECRET, hook: process.env.SITE_DEPLOY_HOOK_URL };
    process.env.SITE_SECRET = "scheduled-test-secret-0123456789";
    const hook = createServer((_req, res) => { res.writeHead(202); res.end(); });
    await new Promise<void>((r) => hook.listen(0, "127.0.0.1", r));
    process.env.SITE_DEPLOY_HOOK_URL = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/hook`;
    try {
      const now = new Date("2026-10-15T10:00:00Z");
      await saveSitePost({ ...post, slug: "sched", publishAt: "2026-10-20T09:00" }, null);
      expect(await publishDueScheduled(now)).toBe(false); // not due yet
      expect(await publishDueScheduled(new Date("2026-10-21T00:00:00Z"))).toBe(true); // due: a publish was started
      expect(await prisma.sitePublish.count()).toBe(1);
      expect(await publishDueScheduled(new Date("2026-10-21T00:01:00Z"))).toBe(false); // already running: not started twice
      expect(await prisma.sitePublish.count()).toBe(1);
      delete process.env.SITE_DEPLOY_HOOK_URL;
      expect(await publishDueScheduled(new Date("2026-10-21T00:00:00Z"))).toBe(false); // publishing is not set up
    } finally {
      await new Promise<void>((r) => hook.close(() => r()));
      if (original.secret === undefined) delete process.env.SITE_SECRET; else process.env.SITE_SECRET = original.secret;
      if (original.hook === undefined) delete process.env.SITE_DEPLOY_HOOK_URL; else process.env.SITE_DEPLOY_HOOK_URL = original.hook;
    }
  });
});

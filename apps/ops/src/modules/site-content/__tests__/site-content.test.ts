import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { GET as getContent } from "@/app/api/site/content/route";
import { POST as postResult } from "@/app/api/site/publish-result/route";
import {
  SiteContentError, buildBundle, cleanContact, cleanLegal, cleanNotice, cleanPost, cleanRelease, postCategories, renameCategory,
  saveLegalPage, saveSiteContact, saveSiteNotice, saveSitePost, saveSiteRelease, deleteSitePost,
} from "../site-content";
import { SitePublishError, publishSite, siteStatus } from "../publish";

const SECRET = "site-test-secret-0123456789";
const post = { slug: "sitetest-post", title: "A post", excerpt: "Short.", date: "2026-10-08", author: "The Platterly team", tags: "Kitchen, Planning", colourway: "citrus", body: "Hello", metaTitle: "", metaDescription: "", ogImage: "", status: "PUBLISHED", publishAt: "" };

async function clean() {
  await prisma.sitePublish.deleteMany();
  await prisma.siteSetting.deleteMany();
  await prisma.siteRelease.deleteMany();
  await prisma.sitePost.deleteMany();
  await prisma.siteLegalPage.deleteMany();
}
// The tests share the dev database, so real content already imported there is set aside and put back afterwards.
let saved: {
  settings: Awaited<ReturnType<typeof prisma.siteSetting.findMany>>;
  releases: Awaited<ReturnType<typeof prisma.siteRelease.findMany>>;
  posts: Awaited<ReturnType<typeof prisma.sitePost.findMany>>;
  pages: Awaited<ReturnType<typeof prisma.siteLegalPage.findMany>>;
  publishes: Awaited<ReturnType<typeof prisma.sitePublish.findMany>>;
};
beforeAll(async () => {
  saved = { settings: await prisma.siteSetting.findMany(), releases: await prisma.siteRelease.findMany(), posts: await prisma.sitePost.findMany(), pages: await prisma.siteLegalPage.findMany(), publishes: await prisma.sitePublish.findMany() };
});
afterAll(async () => {
  await clean();
  await prisma.siteSetting.createMany({ data: saved.settings.map((s) => ({ ...s, value: s.value as object })) });
  await prisma.siteRelease.createMany({ data: saved.releases });
  await prisma.sitePost.createMany({ data: saved.posts });
  await prisma.siteLegalPage.createMany({ data: saved.pages });
  await prisma.sitePublish.createMany({ data: saved.publishes });
});
beforeEach(async () => {
  await clean();
  process.env.SITE_SECRET = SECRET;
  delete process.env.SITE_DEPLOY_HOOK_URL;
});

describe("validation", () => {
  it("needs a message before the bar is on, and both halves of a link", () => {
    expect(() => cleanNotice({ enabled: true, text: " ", linkLabel: "", linkHref: "" })).toThrow(SiteContentError);
    expect(() => cleanNotice({ enabled: false, text: "x", linkLabel: "More", linkHref: "" })).toThrow(/address/);
    expect(() => cleanNotice({ enabled: false, text: "x", linkLabel: "", linkHref: "/a/" })).toThrow(/label/);
    expect(() => cleanNotice({ enabled: true, text: "x", linkLabel: "More", linkHref: "javascript:alert(1)" })).toThrow(/start with/);
    expect(() => cleanNotice({ enabled: true, text: "x", linkLabel: "More", linkHref: "//evil.example" })).toThrow(/start with/);
    expect(cleanNotice({ enabled: true, text: " Hi ", linkLabel: "More", linkHref: "/catering/" })).toEqual({ enabled: true, text: "Hi", linkLabel: "More", linkHref: "/catering/" });
  });
  it("checks contact details and splits lines", () => {
    const base = { email: "hello@platterly.in", phone: "", whatsapp: "", hours: "Mon-Fri 9 to 6\n\n Sat 10 to 2 ", addressLines: "A\nB", reply: "" };
    expect(cleanContact(base).hours).toEqual(["Mon-Fri 9 to 6", "Sat 10 to 2"]);
    expect(() => cleanContact({ ...base, email: "nope" })).toThrow(/valid email/);
    expect(() => cleanContact({ ...base, phone: "abc" })).toThrow(/phone number/);
  });
  it("checks releases, posts and legal pages", () => {
    expect(() => cleanRelease({ id: "Bad Id", date: "2026-10-08", title: "t", body: "b", kind: "new" })).toThrow(/address/);
    expect(() => cleanRelease({ id: "ok", date: "08-10-2026", title: "t", body: "b", kind: "new" })).toThrow(/date/);
    expect(() => cleanRelease({ id: "ok", date: "2026-10-08", title: "t", body: "b", kind: "huge" })).toThrow(/New or Improved/);
    expect(() => cleanPost({ ...post, colourway: "neon" })).toThrow(/colour/);
    expect(() => cleanPost({ ...post, tags: "a,b,c,d,e,f,g" })).toThrow(/at most 6/);
    expect(cleanPost({ ...post, tags: "Kitchen, kitchen ,Kitchen" }).tags).toEqual(["Kitchen", "kitchen"]);
    expect(() => cleanLegal({ slug: "about", title: "t", summary: "s", updated: "2026-10-08", body: "b" })).toThrow(/Unknown page/);
  });
});

describe("saving and the bundle", () => {
  it("sends null for a section never saved, then what was saved", async () => {
    const empty = await buildBundle();
    expect(empty.notice).toBeNull();
    expect(empty.contact).toBeNull();
    await saveSiteNotice({ enabled: true, text: "Hello", linkLabel: "", linkHref: "" }, null);
    await saveSiteContact({ email: "a@b.in", phone: "", whatsapp: "", hours: "", addressLines: "X", reply: "Soon" }, null);
    await saveSiteRelease({ id: "r1", date: "2026-10-01", title: "R", body: "B", kind: "new" }, null);
    await saveSiteRelease({ id: "r1", date: "2026-10-01", title: "R2", body: "B", kind: "improved" }, null);
    await saveSitePost(post, null);
    await saveLegalPage({ slug: "privacy", title: "Privacy", summary: "S", updated: "2026-10-08", body: "Body" }, null);
    const bundle = await buildBundle();
    expect(bundle.notice).toEqual({ enabled: true, text: "Hello", linkLabel: "", linkHref: "" });
    expect(bundle.contact?.addressLines).toEqual(["X"]);
    expect(bundle.releases).toEqual([{ id: "r1", date: "2026-10-01", title: "R2", body: "B", kind: "improved" }]);
    expect(bundle.posts[0].tags).toEqual(["Kitchen", "Planning"]);
    expect(bundle.pages.map((p) => p.slug)).toEqual(["privacy"]);
  });
  it("renames and removes categories across posts and writes audit rows", async () => {
    await saveSitePost(post, "staff1").catch(() => undefined);
    await saveSitePost({ ...post, slug: "sitetest-two", tags: "Planning, Payments" }, null);
    expect((await postCategories()).map((c) => `${c.tag}:${c.posts}`)).toEqual(["Kitchen:1", "Payments:1", "Planning:2"]);
    expect(await renameCategory("Planning", "Planning & prep", null)).toBe(2);
    expect(await renameCategory("Kitchen", "", null)).toBe(1);
    expect((await postCategories()).map((c) => c.tag)).toEqual(["Payments", "Planning & prep"]);
    expect(await prisma.auditLog.count({ where: { action: "site.category.renamed" } })).toBeGreaterThanOrEqual(2);
    await deleteSitePost("sitetest-two", null);
    expect((await buildBundle()).posts.map((p) => p.slug)).toEqual(["sitetest-post"]);
  });
});

describe("the signed content endpoint", () => {
  const call = (headers: Record<string, string>) => getContent(new Request("http://ops.test/api/site/content", { headers }));
  it("answers a correctly signed request and refuses everything else", async () => {
    await saveSiteNotice({ enabled: true, text: "Hello", linkLabel: "", linkHref: "" }, null);
    const good = await call(signedHeaders(SECRET, "build-1", ""));
    expect(good.status).toBe(200);
    expect((await good.json()).notice.text).toBe("Hello");
    expect((await call({})).status).toBe(401);
    expect((await call(signedHeaders("wrong-secret", "build-1", ""))).status).toBe(401);
    expect((await call(signedHeaders(SECRET, "build-1", "", Math.floor(Date.now() / 1000) - 3600))).status).toBe(401);
    delete process.env.SITE_SECRET;
    expect((await call(signedHeaders(SECRET, "build-1", ""))).status).toBe(404);
  });
});

describe("publishing", () => {
  let server: Server;
  let hookUrl = "";
  let hookStatus = 202;
  let hookCalls: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { hookCalls.push({ body, headers: req.headers }); res.writeHead(hookStatus); res.end(); });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => { hookStatus = 202; hookCalls = []; process.env.SITE_DEPLOY_HOOK_URL = hookUrl; });

  it("refuses when publishing is not set up", async () => {
    delete process.env.SITE_DEPLOY_HOOK_URL;
    await expect(publishSite(null)).rejects.toThrow(SitePublishError);
  });
  it("sends a signed request, blocks a second publish, and takes the script's answer once", async () => {
    await saveSiteNotice({ enabled: true, text: "Hello", linkLabel: "", linkHref: "" }, null);
    expect((await siteStatus()).unpublished).toBe(true);
    const publish = await publishSite(null);
    expect(hookCalls).toHaveLength(1);
    expect(verifyRequest([SECRET], hookCalls[0].headers, hookCalls[0].body).ok).toBe(true);
    expect(JSON.parse(hookCalls[0].body)).toEqual({ publishId: publish.id });
    await expect(publishSite(null)).rejects.toThrow(/already running/);

    const answer = (body: object, secret = SECRET) => { const raw = JSON.stringify(body); return postResult(new Request("http://ops.test/api/site/publish-result", { method: "POST", headers: signedHeaders(secret, "cb", raw), body: raw })); };
    expect((await answer({ publishId: publish.id, ok: true }, "wrong")).status).toBe(401);
    expect(((await (await answer({ publishId: publish.id, ok: true, message: "built" })).json()) as { updated: boolean }).updated).toBe(true);
    expect(((await (await answer({ publishId: publish.id, ok: false })).json()) as { updated: boolean }).updated).toBe(false);
    const status = await siteStatus();
    expect(status.lastSuccess?.id).toBe(publish.id);
    expect(status.unpublished).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await saveSiteNotice({ enabled: false, text: "Hello", linkLabel: "", linkHref: "" }, null);
    expect((await siteStatus()).unpublished).toBe(true);
  });
  it("marks the publish failed when the hook refuses", async () => {
    hookStatus = 500;
    await expect(publishSite(null)).rejects.toThrow(/500/);
    const status = await siteStatus();
    expect(status.last?.status).toBe("FAILED");
    hookStatus = 202;
    await expect(publishSite(null)).resolves.toBeTruthy();
  });
});

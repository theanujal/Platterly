import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, parsePlatformProductCards, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { pool, provisionKnown, requireScratchDatabase, reset } from "../../platform-list/__tests__/helpers";
import { handleProductCardImageRequest, handleProductCardsRequest, buildProductCards } from "../cards";
import { ProductCardError, deleteUpcoming, notifyDueLaunches, saveLiveCard, saveUpcoming } from "../manage";

const CARDS_URL = "https://ops.example.com/api/platform/product-cards";
const imageUrl = (name: string) => `${CARDS_URL}/image/${name}`;
const get = (secret: string | null, url = CARDS_URL) => handleProductCardsRequest(new Request(url, { method: "GET", headers: secret === null ? {} : signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", url) }) }));
const getImage = (secret: string | null, name: string) => handleProductCardImageRequest(new Request(imageUrl(name), { method: "GET", headers: secret === null ? {} : signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", imageUrl(name)) }) }), name);

const input = (over: Partial<Parameters<typeof saveUpcoming>[1]> = {}) => ({ key: "pcdsoon", name: "Soon", tagline: "A line", cardImage: "builtin:growth" as string | null, logo: null as string | null, launchAt: null as Date | null, sortOrder: 5, upcoming: true, visible: true, ...over });
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
let dir = "";

async function clean() {
  await prisma.upcomingProduct.deleteMany({ where: { key: { startsWith: "pcd" } } });
  await prisma.notification.deleteMany({ where: { kind: "product_launch_due", dedupeKey: { startsWith: "launch:pcd" } } });
  await prisma.siteMedia.deleteMany({ where: { name: { startsWith: "pcd-" } } });
  await prisma.product.deleteMany({ where: { key: { startsWith: "pcdlive" } } });
  await prisma.auditLog.deleteMany({ where: { subject: { startsWith: "pcd" } } });
}

// Runs only against a scratch database (see the platform-list helpers): it deletes the platform_reader row.
describe("product cards: what the Account's My Products shows, and what staff change", () => {
  beforeAll(async () => {
    requireScratchDatabase();
    dir = await mkdtemp(join(tmpdir(), "ops-cards-"));
    process.env.SITE_MEDIA_DIR = dir;
    await clean();
    await reset();
  });
  beforeEach(async () => {
    await clean();
    await reset();
  });
  afterAll(async () => {
    try {
      await clean();
      await reset();
      await rm(dir, { recursive: true, force: true });
    } finally {
      await pool.end();
    }
  });

  async function seed() {
    await registerProduct({ key: "pcdlive", name: "Live One", baseUrl: "https://pcdlive.example.com", actorUserId: null });
    await registerProduct({ key: "pcdlivebare", name: "Live Bare", baseUrl: "https://pcdlivebare.example.com", actorUserId: null });
    await saveLiveCard(null, "pcdlive", { tagline: "Live line", cardImage: "builtin:cloche", logo: null, about: "About the live one", features: [{ icon: "users", title: "Manage people", text: "Keep them organised." }] });
    await saveUpcoming(null, input({ key: "pcdsoon", name: "Soon", sortOrder: 20, launchAt: new Date("2026-12-01T03:30:00.000Z") }), true);
    await saveUpcoming(null, input({ key: "pcdfirst", name: "First", sortOrder: 10, cardImage: null, tagline: "" }), true);
    await saveUpcoming(null, input({ key: "pcdhidden", name: "Hidden", visible: false }), true);
    await saveUpcoming(null, input({ key: "pcdswitched", name: "Switched", sortOrder: 30, upcoming: false, launchAt: new Date("2026-12-02T03:30:00.000Z") }), true);
  }

  it("lists live products that have a line, then visible upcoming ones in order; a switched-to-live one reads LIVE with no date", async () => {
    await seed();
    const mine = (await buildProductCards()).products.filter((p) => p.key.startsWith("pcd"));
    expect(mine.map((p) => [p.key, p.status])).toEqual([["pcdlive", "LIVE"], ["pcdfirst", "UPCOMING"], ["pcdsoon", "UPCOMING"], ["pcdswitched", "LIVE"]]);
    expect(mine[0]).toMatchObject({ name: "Live One", tagline: "Live line", image: "builtin:cloche", launchAt: null });
    expect(mine[0]).toMatchObject({ about: "About the live one", features: [{ icon: "users", title: "Manage people", text: "Keep them organised." }] });
    expect(mine[1]).toMatchObject({ about: null, features: [] });
    expect(mine[1]).toMatchObject({ tagline: null, image: null, launchAt: null });
    expect(mine[2].launchAt).toBe("2026-12-01T03:30:00.000Z");
    expect(mine[3].launchAt).toBeNull();
  });

  it("answers a signed request with a signed, schema-valid list and refuses anything else with 401", async () => {
    const sign = await provisionKnown();
    await seed();
    const res = await get(sign);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([sign], res.headers, text).ok).toBe(true);
    expect(parsePlatformProductCards(JSON.parse(text)).ok).toBe(true);
    expect(text).not.toMatch(/secret|baseUrl|businessId/i);
    expect((await get(null)).status).toBe(401);
    expect((await get("not-the-secret-0123456789abcdef0123456789abcdef")).status).toBe(401);
  });

  it("serves an uploaded card picture only while a card uses it", async () => {
    const sign = await provisionKnown();
    const name = "pcd-picture.png";
    await writeFile(join(dir, name), PNG);
    await prisma.siteMedia.create({ data: { name, originalName: "picture.png", mime: "image/png", bytes: PNG.length } });
    expect((await getImage(sign, name)).status).toBe(404);
    await saveUpcoming(null, input({ cardImage: `upload:${name}` }), true);
    const res = await getImage(sign, name);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(verifyRequest([sign], res.headers, text).ok).toBe(true);
    expect(JSON.parse(text)).toEqual({ mime: "image/png", bytesBase64: PNG.toString("base64") });
    expect((await getImage(null, name)).status).toBe(401);
    await prisma.upcomingProduct.update({ where: { key: "pcdsoon" }, data: { visible: false } });
    expect((await getImage(sign, name)).status).toBe(404);
  });

  it("refuses what staff should not save, and says why", async () => {
    await registerProduct({ key: "pcdlive", name: "Live One", baseUrl: "https://pcdlive.example.com", actorUserId: null });
    const refused = (promise: Promise<unknown>) => promise.then(() => "saved", (e) => (e instanceof ProductCardError ? e.message : `other: ${e}`));
    expect(await refused(saveUpcoming(null, input({ key: "Bad Key" }), true))).toMatch(/key is lowercase/);
    expect(await refused(saveUpcoming(null, input({ name: " " }), true))).toMatch(/name/);
    expect(await refused(saveUpcoming(null, input({ key: "pcdlive" }), true))).toMatch(/live product/);
    expect(await refused(saveUpcoming(null, input({ cardImage: "https://evil.test/x.png" }), true))).toMatch(/built-in/);
    expect(await refused(saveUpcoming(null, input({ cardImage: "upload:pcd-missing.png" }), true))).toMatch(/not in the library/);
    expect(await refused(saveUpcoming(null, input({ tagline: "x".repeat(301) }), true))).toMatch(/300/);
    expect(await refused(saveUpcoming(null, input({ sortOrder: -1 }), true))).toMatch(/order/);
    expect(await refused(saveLiveCard(null, "pcdlive", { tagline: "x", cardImage: null, logo: null, about: "", features: [{ icon: "nope", title: "T", text: "" }] }))).toMatch(/icon/);
    expect(await refused(saveLiveCard(null, "pcdlive", { tagline: "x", cardImage: null, logo: null, about: "a".repeat(601), features: [] }))).toMatch(/600/);
    expect(await refused(saveUpcoming(null, input({ logo: "builtin:cloche" }), true))).toMatch(/uploaded/);
    expect(await refused(saveUpcoming(null, input({ key: "pcdnone" }), false))).toMatch(/Unknown/);
    expect(await refused(saveLiveCard(null, "pcdmissing", { tagline: "x", cardImage: null, logo: null, about: "", features: [] }))).toMatch(/Unknown/);
    expect(await refused(saveUpcoming(null, input(), true))).toBe("saved");
    expect(await refused(saveUpcoming(null, input(), true))).toMatch(/already/);
    expect(await refused(deleteUpcoming(null, "pcdsoon"))).toBe("saved");
    expect(await refused(deleteUpcoming(null, "pcdsoon"))).toMatch(/Unknown/);
  });

  it("tells staff once when a launch date arrives, again only for a new date, and never for a hidden, switched-off or future one", async () => {
    const now = new Date("2026-12-01T10:00:00.000Z");
    await saveUpcoming(null, input({ key: "pcdsoon", name: "Soon", launchAt: new Date("2026-12-01T09:00:00.000Z") }), true);
    await saveUpcoming(null, input({ key: "pcdfuture", name: "Future", launchAt: new Date("2026-12-09T09:00:00.000Z") }), true);
    await saveUpcoming(null, input({ key: "pcdhidden", name: "Hidden", launchAt: new Date("2026-12-01T09:00:00.000Z"), visible: false }), true);
    await saveUpcoming(null, input({ key: "pcdlive2", name: "Live", launchAt: new Date("2026-12-01T09:00:00.000Z"), upcoming: false }), true);
    await saveUpcoming(null, input({ key: "pcdnodate", name: "No date" }), true);

    expect(await notifyDueLaunches(now)).toBe(1);
    const rows = await prisma.notification.findMany({ where: { kind: "product_launch_due", dedupeKey: { startsWith: "launch:pcd" } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ severity: "WARNING", title: "Soon launches today", link: "/products" });
    expect(rows[0].body).toMatch(/Switch it to live/);

    expect(await notifyDueLaunches(new Date("2026-12-01T10:05:00.000Z"))).toBe(0);
    // A new launch date is a new reminder.
    await saveUpcoming(null, input({ key: "pcdsoon", name: "Soon", launchAt: new Date("2026-12-01T09:30:00.000Z") }), false);
    expect(await notifyDueLaunches(new Date("2026-12-01T10:10:00.000Z"))).toBe(1);
    // Saving the same date again does not.
    await saveUpcoming(null, input({ key: "pcdsoon", name: "Soon renamed", launchAt: new Date("2026-12-01T09:30:00.000Z") }), false);
    expect(await notifyDueLaunches(new Date("2026-12-01T10:15:00.000Z"))).toBe(0);
  });
});

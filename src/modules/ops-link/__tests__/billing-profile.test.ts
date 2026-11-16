import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders, type ProductBillingProfileRecord } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { fetchOwnProfile, refreshOwnProfile, saveOwnProfile, storeProfileCopy } from "../billing-profile";

// Caterly's side of the shared billing profile, against a stand-in for Ops that signs its answers like Ops does.
const COMMAND_SECRET = "opssec_command_test";
const orgIds: string[] = [];
const saved: Record<string, string | undefined> = {};
const record = (version: number, over: Partial<ProductBillingProfileRecord> = {}): ProductBillingProfileRecord => ({ productKey: "catering", version, source: "account", updatedAt: "2026-11-16T10:00:00.000Z", name: "Legal Name", brandName: "Brand", businessPhone: null, orderNumberPrefix: null, orderNumberNextValue: null, orderNumberPadding: null, contactName: null, contactEmail: null, contactPhone: null, addressLine1: "1 MG Road", addressLine2: "Floor 2", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: "27AAPFU0939F1ZV", description: "Weddings", website: "https://spice.example", instagram: null, facebook: null, logoUrl: null, ...over });

function fakeOps(reply: { status: number; body: unknown } | (() => { status: number; body: unknown })) {
  const calls: { method: string; url: string; body: string }[] = [];
  vi.stubGlobal("fetch", (async (input: URL | string, init?: RequestInit) => {
    calls.push({ method: String(init?.method), url: String(input), body: String(init?.body ?? "") });
    const r = typeof reply === "function" ? reply() : reply;
    const text = JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: signedHeaders(COMMAND_SECRET, newId("command"), text) });
  }) as typeof fetch);
  return calls;
}
async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Profile Test Kitchen", slug: `bp-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date(), city: "Old City" } });
  orgIds.push(org.id);
  return org;
}

beforeEach(() => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY"]) saved[k] = process.env[k];
  Object.assign(process.env, { OPS_BASE_URL: "http://ops.test", OPS_EVENT_SECRET: "opssec_event_test", OPS_COMMAND_SECRETS: COMMAND_SECRET, OPS_PRODUCT_KEY: "catering" });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  orgIds.length = 0;
});

describe("the shared billing profile, from Caterly", () => {
  it("stores a read copy, copies the shared fields into the Organization row, and only for a newer version", async () => {
    const org = await makeOrg();
    expect(await storeProfileCopy(org.id, record(2))).toBe(true);
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ name: "Profile Test Kitchen", city: "Pune", addressLine2: "Floor 2", gstNumber: "27AAPFU0939F1ZV", businessDescription: "Weddings", websiteUrl: "https://spice.example" });
    expect(await storeProfileCopy(org.id, record(1, { city: "Older" }))).toBe(false);
    // The logo link replaces the kitchen's logo; a first sync with no logo never wipes it, and a later removal in the Account does.
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).logo).toBeNull();
    await prisma.organization.update({ where: { id: org.id }, data: { logo: "/uploads/own.png" } });
    await storeProfileCopy(org.id, record(3));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).logo).toBe("/uploads/own.png");
    await storeProfileCopy(org.id, record(4, { logoUrl: "http://account.test/api/business-logo/a.png" }));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).logo).toBe("http://account.test/api/business-logo/a.png");
    await storeProfileCopy(org.id, record(5, { logoUrl: null }));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).logo).toBeNull();
    await storeProfileCopy(org.id, record(6, { city: "Pune" }));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).city).toBe("Pune");
  });

  it("refreshes the copy when the page opens, and quietly keeps what it holds when Ops is down", async () => {
    const org = await makeOrg();
    const calls = fakeOps({ status: 200, body: { profile: record(3, { city: "Mumbai" }) } });
    await refreshOwnProfile(org.id, "biz_x");
    expect(calls[0]).toMatchObject({ method: "GET", url: "http://ops.test/api/products/catering/businesses/biz_x/billing-profile" });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).city).toBe("Mumbai");
    vi.stubGlobal("fetch", (async () => { throw new Error("down"); }) as typeof fetch);
    await expect(refreshOwnProfile(org.id, "biz_x")).resolves.toBeUndefined();
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).city).toBe("Mumbai");
    fakeOps({ status: 200, body: { profile: null } });
    expect(await fetchOwnProfile("biz_x")).toBeNull();
  });

  it("saves with the version the form was based on, and turns a stale save into the current record", async () => {
    const fields = { name: "Legal Name", brandName: "Brand", city: "Pune" } as unknown as Parameters<typeof saveOwnProfile>[2];
    const calls = fakeOps({ status: 200, body: { profile: record(4) } });
    const ok = await saveOwnProfile("biz_x", 3, fields);
    expect(ok).toMatchObject({ ok: true, profile: { version: 4 } });
    expect(calls[0].method).toBe("PUT");
    expect(JSON.parse(calls[0].body)).toMatchObject({ baseVersion: 3, fields: { brandName: "Brand" } });
    fakeOps({ status: 409, body: { error: "conflict", current: record(5, { city: "Chennai" }) } });
    const conflict = await saveOwnProfile("biz_x", 3, fields);
    expect(conflict).toMatchObject({ ok: false, conflict: { version: 5, city: "Chennai" } });
    fakeOps({ status: 400, body: { error: "fields.gstin: Enter a valid 15-character GSTIN, or leave it blank." } });
    expect(await saveOwnProfile("biz_x", 3, fields)).toMatchObject({ ok: false, error: expect.stringContaining("GSTIN") });
    vi.stubGlobal("fetch", (async () => { throw new Error("down"); }) as typeof fetch);
    expect(await saveOwnProfile("biz_x", 3, fields)).toMatchObject({ ok: false, error: expect.stringContaining("Nothing was changed") });
  });

  it("a business with no profile in Ops gets its Caterly details sent as the first profile; an unnamed one waits; a refusal changes nothing", async () => {
    const org = await makeOrg();
    await prisma.organization.update({ where: { id: org.id }, data: { contactPhone: "+919800000001", gstNumber: "27AAPFU0939F1ZV", websiteUrl: "https://spice.example" } });
    const sent: { method: string; body: string }[] = [];
    vi.stubGlobal("fetch", (async (_url: string, init?: RequestInit) => {
      sent.push({ method: String(init?.method), body: String(init?.body ?? "") });
      const reply = init?.method === "GET" ? { profile: null } : { profile: record(1, { source: "product", name: "Profile Test Kitchen", city: "Old City" }) };
      const text = JSON.stringify(reply);
      return new Response(text, { status: 200, headers: signedHeaders(COMMAND_SECRET, newId("command"), text) });
    }) as typeof fetch);
    await refreshOwnProfile(org.id, "biz_seed");
    expect(sent.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(JSON.parse(sent[1].body)).toMatchObject({ baseVersion: null, fields: { name: "Profile Test Kitchen", businessPhone: "+919800000001", gstin: "27AAPFU0939F1ZV", city: "Old City", website: "https://spice.example" } });
    expect((await prisma.organizationBillingProfile.findUniqueOrThrow({ where: { organizationId: org.id } })).version).toBe(1);

    const unnamed = await makeOrg();
    await prisma.organization.update({ where: { id: unnamed.id }, data: { name: "Unnamed Business" } });
    sent.length = 0;
    await refreshOwnProfile(unnamed.id, "biz_unnamed");
    expect(sent.map((c) => c.method)).toEqual(["GET"]);

    const refused = await makeOrg();
    vi.stubGlobal("fetch", (async (_url: string, init?: RequestInit) => {
      const body = init?.method === "GET" ? { profile: null } : { error: "fields.gstin: bad" };
      const text = JSON.stringify(body);
      return new Response(text, { status: init?.method === "GET" ? 200 : 400, headers: signedHeaders(COMMAND_SECRET, newId("command"), text) });
    }) as typeof fetch);
    await expect(refreshOwnProfile(refused.id, "biz_refused")).resolves.toBeUndefined();
    expect(await prisma.organizationBillingProfile.findUnique({ where: { organizationId: refused.id } })).toBeNull();
  });
});

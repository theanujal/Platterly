import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest, type EntitlementSnapshot } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { runOpsLinkJobs } from "../events";
import { pullDueSnapshots, pullSnapshot } from "../pull";

const COMMAND_SECRET = "opssec_pull_command";
const EVENT_SECRET = "opssec_pull_event";
const startedAt = new Date();
const saved: Record<string, string | undefined> = {};
const orgIds: string[] = [];

let server: Server;
let baseUrl = "";
let mode: "ok" | "404" | "500" | "unsigned" | "wrong-business" | "wrong-product" = "ok";
let seen: { url: string | undefined; headers: Record<string, string | string[] | undefined> }[] = [];
let version = 4;

function snapshotFor(businessId: string, over: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return { businessId, productKey: "catering", subscriptionId: newId("subscription"), version, plan: { code: "pro", name: "Pro" }, status: "ACTIVE", interval: null, currentPeriodEnd: null, trialEndsAt: null, entitlements: { maxCustomers: 3 }, issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(), ...over };
}

beforeAll(async () => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY", "OPS_BILLING"]) saved[k] = process.env[k];
  server = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const id = req.url!.split("/").pop()!;
    if (mode === "404") return void ((res.statusCode = 404), res.end(JSON.stringify({ error: "not_found" })));
    if (mode === "500") return void ((res.statusCode = 500), res.end("{}"));
    const snap = mode === "wrong-business" ? snapshotFor(`biz_${"f".repeat(32)}`) : mode === "wrong-product" ? snapshotFor(id, { productKey: "restaurant" }) : snapshotFor(id);
    const text = JSON.stringify(snap);
    res.writeHead(200, mode === "unsigned" ? {} : signedHeaders(COMMAND_SECRET, newId("command"), text));
    res.end(text);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  process.env.OPS_BASE_URL = baseUrl;
  process.env.OPS_EVENT_SECRET = EVENT_SECRET;
  process.env.OPS_COMMAND_SECRETS = COMMAND_SECRET;
  process.env.OPS_PRODUCT_KEY = "catering";
  mode = "ok";
  seen = [];
  version = 4;
});
afterEach(async () => {
  // The scheduled run walks every kitchen in the dev database, so remove everything written since this file started.
  await prisma.opsSnapshot.deleteMany({ where: { OR: [{ receivedAt: { gte: startedAt } }, { organizationId: { in: orgIds } }] } });
  await prisma.opsPull.deleteMany({ where: { lastPulledAt: { gte: startedAt } } });
  await prisma.opsOutbox.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  orgIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Pull Kitchen", slug: `pull-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}

describe("pulling a snapshot from ops", () => {
  it("asks ops with a request signed by the event secret, verifies the signed reply and stores it", async () => {
    const org = await makeOrg();
    expect(await pullSnapshot(org.id, org.businessId)).toBe("stored");
    expect(seen[0].url).toBe(`/api/products/catering/snapshots/${org.businessId}`);
    expect(verifyRequest([EVENT_SECRET], new Headers(seen[0].headers as Record<string, string>), "").ok).toBe(true);
    const row = await prisma.opsSnapshot.findUniqueOrThrow({ where: { businessId: org.businessId } });
    expect(row).toMatchObject({ organizationId: org.id, version: 4 });
    expect(await pullSnapshot(org.id, org.businessId)).toBe("unchanged");
  });

  it("ignores an unsigned reply, a reply for another business or product, and a server error", async () => {
    const org = await makeOrg();
    for (const m of ["unsigned", "wrong-business", "wrong-product", "500"] as const) {
      mode = m;
      expect(await pullSnapshot(org.id, org.businessId), m).toBe("failed");
    }
    expect(await prisma.opsSnapshot.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("remembers a 404 so the business is not asked again until a day has passed", async () => {
    const org = await makeOrg();
    mode = "404";
    expect(await pullSnapshot(org.id, org.businessId)).toBe("none");
    expect(await prisma.opsPull.findUniqueOrThrow({ where: { businessId: org.businessId } })).toMatchObject({ lastStatus: 404 });
    seen = [];
    await pullDueSnapshots(new Date(), 1000);
    expect(seen.filter((s) => s.url!.endsWith(org.businessId))).toHaveLength(0);
    // A day later it is asked again.
    await pullDueSnapshots(new Date(Date.now() + 25 * 3_600_000), 1000);
    expect(seen.filter((s) => s.url!.endsWith(org.businessId))).toHaveLength(1);
  });

  it("the scheduled run pulls kitchens with a missing or old snapshot, and leaves fresh ones alone", async () => {
    const missing = await makeOrg();
    const fresh = await makeOrg();
    await prisma.opsSnapshot.create({ data: { businessId: fresh.businessId, organizationId: fresh.id, version: 9, data: snapshotFor(fresh.businessId, { version: 9 }) as never } });
    const stored = await pullDueSnapshots(new Date(), 1000);
    expect(stored).toBeGreaterThanOrEqual(1);
    expect((await prisma.opsSnapshot.findUniqueOrThrow({ where: { businessId: missing.businessId } })).version).toBe(4);
    expect(seen.filter((s) => s.url!.endsWith(fresh.businessId))).toHaveLength(0);
    // Once the fresh one is a day old, it is pulled too (here ops has a lower version, so nothing changes).
    seen = [];
    await prisma.opsSnapshot.update({ where: { businessId: fresh.businessId }, data: { receivedAt: new Date(Date.now() - 25 * 3_600_000) } });
    await pullDueSnapshots(new Date(), 1000);
    expect(seen.filter((s) => s.url!.endsWith(fresh.businessId))).toHaveLength(1);
    expect((await prisma.opsSnapshot.findUniqueOrThrow({ where: { businessId: fresh.businessId } })).version).toBe(9);
  });

  it("is part of the scheduled job and does nothing while the link is off", async () => {
    await makeOrg();
    // A run pulls at most 50 kitchens (oldest first), so which ones it reaches depends on the database; that it pulls is the point.
    const result = await runOpsLinkJobs(new Date(), 1000);
    expect(result.pulled).toBeGreaterThanOrEqual(1);
    delete process.env.OPS_BASE_URL;
    expect(await pullDueSnapshots()).toBe(0);
  });
});

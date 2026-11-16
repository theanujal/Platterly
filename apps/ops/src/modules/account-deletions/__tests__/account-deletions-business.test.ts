import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, requestTarget, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { POST as openPOST } from "@/app/api/platform/account-deletions/route";
import { POST as withdrawPOST } from "@/app/api/platform/account-deletions/withdraw/route";
import { POST as statusPOST } from "@/app/api/platform/account-deletions/status/route";
import { APPROVING_STALE_MS, approveAccountDeletion, declineAccountDeletion, restoreAccountDeletion } from "../account-deletions";

const sendEmail = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/modules/messages/zeptomail", () => ({ sendEmail, zeptoConfigured: () => true }));

// Approving and restoring a deletion request that has a business: the business is suspended in every product it uses, a product that refuses leaves the request
// pending, and a withdrawal that arrives while staff approve cannot leave the business suspended with the request withdrawn.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const KEYS = ["adbiza", "adbizb"] as const;
let businessId = "";
const inbound: Record<string, string> = {};
let received: { product: string; type: string }[] = [];
let refuse: Record<string, boolean> = {};
let onCall: ((product: string, type: string) => Promise<void>) | null = null;
const saved = process.env.PLATFORM_BILLING_SECRETS;
const savedStaff = process.env.STAFF_NOTIFY_EMAILS;

const stub = (async (url: string, init: RequestInit) => {
  const product = KEYS.find((k) => new URL(url).host === `${k}.test`)!;
  const type = JSON.parse(String(init.body)).type as string;
  received.push({ product, type });
  if (onCall) await onCall(product, type);
  const reply = refuse[product] ? { status: 409, body: { ok: false, error: "not_now" } } : { status: 200, body: { ok: true } };
  const text = JSON.stringify(reply.body);
  return new Response(text, { status: reply.status, headers: signedHeaders(inbound[product], newId("command"), text) });
}) as unknown as typeof fetch;

async function clean() {
  await prisma.accountDeletionRequest.deleteMany({ where: { requestId: { startsWith: "delbiz-" } } });
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: "account.deletion:delbiz-" } } });
  await prisma.auditLog.deleteMany({ where: { subject: { startsWith: "delbiz-" } } });
  await prisma.business.deleteMany({ where: { products: { some: { productKey: { in: [...KEYS] } } } } });
  await prisma.product.deleteMany({ where: { key: { in: [...KEYS] } } });
}

beforeEach(async () => {
  await clean();
  process.env.PLATFORM_BILLING_SECRETS = SECRET;
  received = []; refuse = {}; onCall = null; sendEmail.mockClear();
  for (const key of KEYS) inbound[key] = (await registerProduct({ key, name: key, baseUrl: `http://${key}.test`, actorUserId: null })).secrets.inbound;
  businessId = newId("business");
  await prisma.business.create({ data: { id: businessId, name: "Deletion Kitchen", ownerName: "Asha", ownerEmail: "asha@del.example.test", products: { create: KEYS.map((productKey) => ({ productKey })) } } });
});
afterEach(async () => {
  await clean();
  if (saved === undefined) delete process.env.PLATFORM_BILLING_SECRETS; else process.env.PLATFORM_BILLING_SECRETS = saved;
  if (savedStaff === undefined) delete process.env.STAFF_NOTIFY_EMAILS; else process.env.STAFF_NOTIFY_EMAILS = savedStaff;
});

const call = (handler: (r: Request) => Promise<Response>, path: string, payload: unknown) => {
  const text = JSON.stringify(payload);
  const url = `http://ops.localhost:3200${path}`;
  return handler(new Request(url, { method: "POST", body: text, headers: { "content-type": "application/json", ...signedHeaders(SECRET, newId("command"), text, { target: requestTarget("POST", url) }) } }));
};
async function openRequest() {
  const requestId = `delbiz-${crypto.randomUUID()}`;
  await call(openPOST, "/api/platform/account-deletions", { requestId, subject: "sub-1", name: "Asha Rao", email: "asha@del.example.test", phone: "+919800000123", businessId, businessName: "Deletion Kitchen", products: [...KEYS], reason: "closing", requestedAt: new Date().toISOString() });
  return { requestId, id: (await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { requestId } })).id };
}
const requestStatus = async (id: string) => (await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id } })).status;
const businessStatus = async () => (await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).status;

describe("account deletion with a business", () => {
  it("emails staff when a request opens, not only the bell", async () => {
    process.env.STAFF_NOTIFY_EMAILS = "staff@platterly.test";
    await openRequest();
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "staff@platterly.test" }));
  });

  it("approve suspends the business in every product; restore brings it back in every product", async () => {
    const { id } = await openRequest();
    await approveAccountDeletion(id, null, new Date(), stub);
    expect(received).toEqual([{ product: "adbiza", type: "business.delete" }, { product: "adbizb", type: "business.delete" }]);
    expect(await requestStatus(id)).toBe("APPROVED");
    expect(await businessStatus()).toBe("PENDING_DELETE");
    received = [];
    await restoreAccountDeletion(id, null, stub);
    expect(received.map((r) => r.type)).toEqual(["business.restore", "business.restore"]);
    expect(await requestStatus(id)).toBe("RESTORED");
    expect(await businessStatus()).toBe("ACTIVE");
  });

  it("a product that refuses puts the request back to pending and brings back the products suspended in that try; the retry finishes", async () => {
    const { id } = await openRequest();
    refuse = { adbizb: true };
    await expect(approveAccountDeletion(id, null, new Date(), stub)).rejects.toThrow(/adbizb did not accept the suspension/);
    expect(received).toEqual([{ product: "adbiza", type: "business.delete" }, { product: "adbizb", type: "business.delete" }, { product: "adbiza", type: "business.restore" }]);
    expect(await requestStatus(id)).toBe("PENDING");
    expect(await businessStatus()).toBe("ACTIVE"); // nothing stays suspended, so Decline afterwards leaves the business as it was
    received = []; refuse = {};
    await approveAccountDeletion(id, null, new Date(), stub);
    expect(received).toEqual([{ product: "adbiza", type: "business.delete" }, { product: "adbizb", type: "business.delete" }]);
    expect(await requestStatus(id)).toBe("APPROVED");
    expect(await businessStatus()).toBe("PENDING_DELETE");
  });

  it("a business that was already suspended is not restored by a failed try, and a retry keeps its restore date", async () => {
    const { id } = await openRequest();
    const first = new Date("2026-11-01T00:00:00Z");
    await prisma.business.update({ where: { id: businessId }, data: { status: "PENDING_DELETE", deleteAfter: new Date(first.getTime() + 30 * 86_400_000) } });
    refuse = { adbizb: true };
    await expect(approveAccountDeletion(id, null, new Date(), stub)).rejects.toThrow(/did not accept/);
    expect(received.some((r) => r.type === "business.restore")).toBe(false);
    refuse = {};
    await approveAccountDeletion(id, null, new Date("2026-11-10T00:00:00Z"), stub);
    const row = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id } });
    expect(row.eraseAfter?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).deleteAfter?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("a request stuck in APPROVING can be approved again once the claim is stale, but not while it is fresh", async () => {
    const { id } = await openRequest();
    const now = new Date();
    await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "APPROVING", decidedAt: now } });
    await expect(approveAccountDeletion(id, null, now, stub)).rejects.toThrow(/no longer pending/);
    await prisma.accountDeletionRequest.update({ where: { id }, data: { decidedAt: new Date(now.getTime() - APPROVING_STALE_MS - 1000) } });
    await approveAccountDeletion(id, null, now, stub);
    expect(await requestStatus(id)).toBe("APPROVED");
  });

  it("a stale APPROVING request can be declined: the business is brought back first", async () => {
    const { id } = await openRequest();
    await prisma.business.update({ where: { id: businessId }, data: { status: "PENDING_DELETE", deleteAfter: new Date() } });
    await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "APPROVING", priorBusinessStatus: "ACTIVE", decidedAt: new Date(Date.now() - APPROVING_STALE_MS - 1000) } });
    await declineAccountDeletion(id, "Please finish your invoices first.", null, new Date(), stub);
    expect(received.map((r) => r.type)).toEqual(["business.restore", "business.restore"]);
    expect(await requestStatus(id)).toBe("DECLINED");
    expect(await businessStatus()).toBe("ACTIVE");
  });

  it("a business that was SUSPENDED before the request is never reactivated: not by a failed approve, a stale decline or a restore", async () => {
    const { id } = await openRequest();
    await prisma.business.update({ where: { id: businessId }, data: { status: "SUSPENDED" } });
    refuse = { adbizb: true };
    await expect(approveAccountDeletion(id, null, new Date(), stub)).rejects.toThrow(/did not accept/);
    expect(received.some((r) => r.type === "business.restore")).toBe(false); // no undo for a business that was not ACTIVE
    expect((await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id } })).priorBusinessStatus).toBe("SUSPENDED");
    // a stale decline brings nothing back either
    await prisma.accountDeletionRequest.update({ where: { id }, data: { status: "APPROVING", decidedAt: new Date(Date.now() - APPROVING_STALE_MS - 1000) } });
    received = [];
    await declineAccountDeletion(id, "Not now.", null, new Date(), stub);
    expect(received).toEqual([]);
  });

  it("restoring an approved request keeps a business that was suspended for another reason suspended", async () => {
    const { id } = await openRequest();
    await prisma.business.update({ where: { id: businessId }, data: { status: "SUSPENDED" } });
    await approveAccountDeletion(id, null, new Date(), stub);
    received = [];
    await restoreAccountDeletion(id, null, stub);
    expect(received.map((r) => r.type)).toEqual(["business.restore", "business.suspend", "business.restore", "business.suspend"]);
    expect(await businessStatus()).toBe("SUSPENDED");
  });

  it("a withdrawal that arrives while staff approve is refused: the request ends approved, never withdrawn with a suspended business", async () => {
    const { id, requestId } = await openRequest();
    let withdrawn: unknown = null;
    onCall = async (product) => {
      if (product !== "adbizb" || withdrawn) return;
      withdrawn = await (await call(withdrawPOST, "/api/platform/account-deletions/withdraw", { requestId })).json();
    };
    await approveAccountDeletion(id, null, new Date(), stub);
    expect(withdrawn).toEqual({ requestId, status: "PENDING" }); // the Platform is told it is still waiting; the contract has no "approving" word
    expect(await requestStatus(id)).toBe("APPROVED");
    expect(await businessStatus()).toBe("PENDING_DELETE");
    expect(await (await call(statusPOST, "/api/platform/account-deletions/status", { requestId })).json()).toMatchObject({ status: "APPROVED" });
  });

  it("a second approve at the same time is refused", async () => {
    const { id } = await openRequest();
    let second: unknown = null;
    onCall = async (product) => {
      if (product !== "adbiza" || second) return;
      second = await approveAccountDeletion(id, null, new Date(), stub).catch((e: Error) => e.message);
    };
    await approveAccountDeletion(id, null, new Date(), stub);
    expect(second).toMatch(/no longer pending/);
    expect(await requestStatus(id)).toBe("APPROVED");
  });
});

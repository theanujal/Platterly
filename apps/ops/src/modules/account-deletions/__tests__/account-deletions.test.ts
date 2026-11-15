import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, requestTarget, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { POST as openPOST } from "@/app/api/platform/account-deletions/route";
import { POST as statusPOST } from "@/app/api/platform/account-deletions/status/route";
import { POST as withdrawPOST } from "@/app/api/platform/account-deletions/withdraw/route";
import { approveAccountDeletion, declineAccountDeletion, restoreAccountDeletion } from "../account-deletions";

// The Platform opens a deletion request when a person asks on My Profile; staff decide; the Platform asks for the decision.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const BASE = "http://ops.localhost:3200";
const saved: Record<string, string | undefined> = {};
const ids: string[] = [];

beforeAll(() => { saved.PLATFORM_BILLING_SECRETS = process.env.PLATFORM_BILLING_SECRETS; });
beforeEach(() => { process.env.PLATFORM_BILLING_SECRETS = SECRET; });
afterEach(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { in: ids.map((i) => `account.deletion:${i}`) } } });
  await prisma.accountDeletionRequest.deleteMany({ where: { requestId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "account_deletion." }, subject: { in: ids } } });
});
afterAll(() => {
  if (saved.PLATFORM_BILLING_SECRETS === undefined) delete process.env.PLATFORM_BILLING_SECRETS;
  else process.env.PLATFORM_BILLING_SECRETS = saved.PLATFORM_BILLING_SECRETS;
});

const body = (over: Record<string, unknown> = {}) => {
  const requestId = `del-${crypto.randomUUID()}`;
  ids.push(requestId);
  return { requestId, subject: "sub-1", name: "Asha Rao", email: "asha@example.com", phone: "+919800000123", businessId: null, businessName: null, products: [], reason: "closing down", requestedAt: new Date().toISOString(), ...over };
};
const call = (handler: (r: Request) => Promise<Response>, path: string, payload: unknown, secret: string | null = SECRET) => {
  const text = JSON.stringify(payload);
  const url = `${BASE}${path}`;
  const id = newId("command");
  return handler(new Request(url, { method: "POST", body: text, headers: { "content-type": "application/json", ...(secret ? signedHeaders(secret, id, text, { target: requestTarget("POST", url) }) : {}) } }));
};
const open = (b: Record<string, unknown>) => call(openPOST, "/api/platform/account-deletions", b);
const status = async (requestId: string) => (await call(statusPOST, "/api/platform/account-deletions/status", { requestId })).json();
const idOf = async (requestId: string) => (await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { requestId } })).id;

describe("account deletion requests (Platform to Ops)", () => {
  it("opens a request, notifies staff once, and a repeat changes nothing", async () => {
    const b = body();
    const res = await open(b);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requestId: b.requestId, created: true });
    expect(await prisma.notification.count({ where: { dedupeKey: `account.deletion:${b.requestId}` } })).toBe(1);
    expect(await (await open(b)).json()).toEqual({ requestId: b.requestId, created: false });
    expect(await prisma.accountDeletionRequest.count({ where: { requestId: b.requestId } })).toBe(1);
    expect(await status(b.requestId)).toMatchObject({ status: "PENDING", declineReason: null });
  });

  it("refuses an unsigned call and a malformed request, and answers 404 for an unknown id", async () => {
    expect((await call(openPOST, "/api/platform/account-deletions", body(), null)).status).toBe(401);
    expect((await open(body({ email: "not-an-email" }))).status).toBe(400);
    expect((await call(statusPOST, "/api/platform/account-deletions/status", { requestId: "nope" })).status).toBe(404);
  });

  it("lets the person withdraw only while it is pending", async () => {
    const a = body();
    await open(a);
    expect(await (await call(withdrawPOST, "/api/platform/account-deletions/withdraw", { requestId: a.requestId })).json()).toEqual({ requestId: a.requestId, status: "WITHDRAWN" });
    const b = body();
    await open(b);
    await approveAccountDeletion(await idOf(b.requestId), null);
    expect(await (await call(withdrawPOST, "/api/platform/account-deletions/withdraw", { requestId: b.requestId })).json()).toEqual({ requestId: b.requestId, status: "APPROVED" });
  });

  it("approves (a retention end date is set), then restores", async () => {
    const b = body();
    await open(b);
    const id = await idOf(b.requestId);
    const now = new Date("2026-11-20T00:00:00Z");
    await approveAccountDeletion(id, null, now);
    expect(await status(b.requestId)).toMatchObject({ status: "APPROVED", eraseAfter: "2026-12-20T00:00:00.000Z" });
    await expect(approveAccountDeletion(id, null)).rejects.toThrow(/no longer pending/);
    await restoreAccountDeletion(id, null);
    expect(await status(b.requestId)).toMatchObject({ status: "RESTORED", eraseAfter: null });
  });

  it("declines only with a reason, and passes that reason on", async () => {
    const b = body();
    await open(b);
    const id = await idOf(b.requestId);
    await expect(declineAccountDeletion(id, "   ", null)).rejects.toThrow(/reason/);
    await declineAccountDeletion(id, "Please finish your open invoices first.", null);
    expect(await status(b.requestId)).toMatchObject({ status: "DECLINED", declineReason: "Please finish your open invoices first." });
    await expect(restoreAccountDeletion(id, null)).rejects.toThrow(/approved/);
  });
});

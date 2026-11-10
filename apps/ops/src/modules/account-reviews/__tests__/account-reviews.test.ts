import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { POST as openPOST } from "@/app/api/platform/account-reviews/route";
import { POST as statusPOST } from "@/app/api/platform/account-reviews/status/route";
import { clearAccountReview } from "../account-reviews";

// The Platform opens an account review when the old address cancels an email change, and asks for its status when the held person tries to sign in.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const BASE = "http://ops.localhost:3200";
const saved: Record<string, string | undefined> = {};
const ids: string[] = [];

beforeAll(() => { saved.PLATFORM_BILLING_SECRETS = process.env.PLATFORM_BILLING_SECRETS; });
beforeEach(() => { process.env.PLATFORM_BILLING_SECRETS = SECRET; });
afterEach(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { in: ids.map((i) => `account.review:${i}`) } } });
  await prisma.accountReview.deleteMany({ where: { reviewId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { action: "account_review.cleared", subject: { in: ids } } });
});
afterAll(() => {
  if (saved.PLATFORM_BILLING_SECRETS === undefined) delete process.env.PLATFORM_BILLING_SECRETS;
  else process.env.PLATFORM_BILLING_SECRETS = saved.PLATFORM_BILLING_SECRETS;
});

const body = (over: Record<string, unknown> = {}) => {
  const reviewId = `chg-${crypto.randomUUID()}`;
  ids.push(reviewId);
  return { reviewId, subject: "sub-1", oldEmail: "old@example.com", newEmail: "new@example.com", reason: "not_me", note: "I did not do this", requestedAt: new Date().toISOString(), ...over };
};
const call = (handler: (r: Request) => Promise<Response>, path: string, payload: unknown, secret: string | null = SECRET) => {
  const text = JSON.stringify(payload);
  const url = `${BASE}${path}`;
  const id = newId("command");
  return { id, response: handler(new Request(url, { method: "POST", body: text, headers: { "content-type": "application/json", ...(secret ? signedHeaders(secret, id, text, { target: requestTarget("POST", url) }) : {}) } })) };
};

describe("account reviews (Platform to Ops)", () => {
  it("opens a review, notifies staff once, and answers signed with the request's id; a repeat changes nothing", async () => {
    const b = body();
    const first = call(openPOST, "/api/platform/account-reviews", b);
    const res = await first.response;
    expect(res.status).toBe(200);
    expect(await res.clone().json()).toEqual({ reviewId: b.reviewId, created: true });
    const verified = verifyRequest([SECRET], res.headers, await res.clone().text());
    expect(verified.ok && verified.id).toBe(first.id);
    expect(await prisma.notification.count({ where: { dedupeKey: `account.review:${b.reviewId}` } })).toBe(1);
    const again = await call(openPOST, "/api/platform/account-reviews", b).response;
    expect(await again.json()).toEqual({ reviewId: b.reviewId, created: false });
    expect(await prisma.accountReview.count({ where: { reviewId: b.reviewId } })).toBe(1);
    expect(await prisma.notification.count({ where: { dedupeKey: `account.review:${b.reviewId}` } })).toBe(1);
  });

  it("reports OPEN until staff clear it, then CLEARED; an unknown review is 404", async () => {
    const b = body();
    await call(openPOST, "/api/platform/account-reviews", b).response;
    const status = async (reviewId: string) => call(statusPOST, "/api/platform/account-reviews/status", { reviewId }).response;
    expect(await (await status(b.reviewId)).json()).toEqual({ reviewId: b.reviewId, status: "OPEN" });
    const row = await prisma.accountReview.findUniqueOrThrow({ where: { reviewId: b.reviewId } });
    expect(await clearAccountReview(row.id, null)).toBe(true);
    expect(await clearAccountReview(row.id, null)).toBe(false);
    expect(await (await status(b.reviewId)).json()).toEqual({ reviewId: b.reviewId, status: "CLEARED" });
    expect((await status("chg-unknown")).status).toBe(404);
  });

  it("refuses an unsigned or wrongly signed call, a bad body, and does nothing when no secret is configured", async () => {
    const b = body();
    expect((await call(openPOST, "/api/platform/account-reviews", b, null).response).status).toBe(401);
    expect((await call(openPOST, "/api/platform/account-reviews", b, "another-secret-0123456789abcdef0123456789").response).status).toBe(401);
    expect((await call(openPOST, "/api/platform/account-reviews", body({ reason: "because" })).response).status).toBe(400);
    expect((await call(openPOST, "/api/platform/account-reviews", body({ newEmail: "nope" })).response).status).toBe(400);
    delete process.env.PLATFORM_BILLING_SECRETS;
    expect((await call(openPOST, "/api/platform/account-reviews", b).response).status).toBe(401);
    expect(await prisma.accountReview.count({ where: { reviewId: b.reviewId } })).toBe(0);
  });
});

import "server-only";
import { CONTRACT_VERSION, parseAccountReviewRequest, parseAccountReviewStatusRequest, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notify } from "@/modules/notifications/notifications";
import { platformBillingSecrets } from "@/modules/platform-list/platform-checkout";

/**
 * Account reviews (AJ, 2026-11-10). The Platform tells Ops when the old address cancelled an email change: the account is on hold and a staff member must verify
 * the person before it is released. Two signed POSTs with the platform-billing secret (route-bound, signed answers carrying the request's id):
 *   POST /api/platform/account-reviews         opens a review (a repeat of the same reviewId changes nothing) and notifies staff
 *   POST /api/platform/account-reviews/status  {reviewId} -> {status: OPEN | CLEARED}; the Platform asks when the held person tries to sign in
 * Anything wrong with the signature looks the same: 401.
 */
async function signedCall(request: Request, handle: (json: unknown) => Promise<{ status: number; body: unknown }>): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = platformBillingSecrets();
  if (!secrets) return unauthorized;
  const rawBody = await request.text();
  if (rawBody.length > 8 * 1024) return Response.json({ error: "body too large" }, { status: 413 });
  const verified = verifyRequest(secrets.accept, request.headers, rawBody, { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    json = null;
  }
  const out = await handle(json);
  const text = JSON.stringify(out.body);
  return new Response(text, { status: out.status, headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
}

const REASON_TEXT = { not_me: "says it was not them", mistake: "says it was a mistake", other: "gave another reason" } as const;

export const handleAccountReviewOpen = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountReviewRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const r = parsed.value;
    const made = await prisma.accountReview.createMany({
      data: [{ reviewId: r.reviewId, subject: r.subject, oldEmail: r.oldEmail.toLowerCase(), newEmail: r.newEmail.toLowerCase(), reason: r.reason, note: r.note, requestedAt: new Date(r.requestedAt) }],
      skipDuplicates: true,
    });
    if (made.count > 0) {
      await notify({
        kind: "account.review",
        severity: "WARNING",
        title: "An email change was cancelled: account on hold",
        body: `The owner of ${r.oldEmail} cancelled a change to ${r.newEmail} and ${REASON_TEXT[r.reason]}. The account is on hold until you verify the person.`,
        link: "/account-reviews",
        dedupeKey: `account.review:${r.reviewId}`,
        emailStaff: true,
      }).catch((error) => console.error("[account-reviews] notification failed", error));
    }
    return { status: 200, body: { reviewId: r.reviewId, created: made.count > 0 } };
  });

export const handleAccountReviewStatus = (request: Request) =>
  signedCall(request, async (json) => {
    const parsed = parseAccountReviewStatusRequest(json);
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const row = await prisma.accountReview.findUnique({ where: { reviewId: parsed.value.reviewId }, select: { status: true } });
    return row ? { status: 200, body: { reviewId: parsed.value.reviewId, status: row.status === "CLEARED" ? "CLEARED" : "OPEN" } } : { status: 404, body: { error: "unknown_review" } };
  });

export const listAccountReviews = (status?: "OPEN" | "CLEARED") => prisma.accountReview.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: "desc" }, take: 200 });

/** Staff have verified the person: the Platform releases the hold the next time that person signs in. */
export async function clearAccountReview(id: string, staffUserId: string | null): Promise<boolean> {
  const done = await prisma.accountReview.updateMany({ where: { id, status: "OPEN" }, data: { status: "CLEARED", clearedAt: new Date(), clearedBy: staffUserId } });
  if (done.count > 0) await audit({ actorUserId: staffUserId, action: "account_review.cleared", subject: id });
  return done.count > 0;
}

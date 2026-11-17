import { timingSafeEqual } from "node:crypto";
import { claimExpiredNotices } from "@/modules/account/email-change";
import { sendNotYou } from "@/modules/account/email-notices";
import { resendUnnotified } from "@/modules/account/hold";
import { syncDeletionRequests } from "@/modules/account/deletion-ops";
import { sweepAbandonedLogos } from "@/modules/account/logo-sweep";
import { prisma } from "@/lib/db";
import { identityPool } from "@/modules/auth/identity-db";
import { expireTransfer } from "@/modules/ownership-transfer";

// Scheduled job for the Account's email-change safeguards. POST only; callers send `Authorization: Bearer <CRON_SECRET>`.
//  - an email change whose code ran out unused: the old address is told once that nothing changed;
//  - an Admin-transfer invitation that ran out is recorded as expired (also while the business is locked);
//  - an account deletion request Ops has not been told about, or has decided: told again, or the decision is picked up;
//  - a logo uploaded in the Account and never saved to a profile, a week old: its file is deleted;
//  - a hold Ops has not been told about yet (Ops was down when the old address cancelled): Ops is told again.
// Safe to call as often as you like: each notice is claimed in one statement and Ops treats a repeat as nothing new.
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  const pool = identityPool();
  const notices = await claimExpiredNotices(pool);
  for (const n of notices) await sendNotYou(n.oldEmail);
  const opsTold = await resendUnnotified(pool).catch(() => 0);
  // Deletion requests: Ops is told about new ones and withdrawals, and its decisions are picked up (an approval blocks the person's sign-in).
  const deletions = await syncDeletionRequests(pool).catch(() => ({ sent: 0, decided: 0, erased: 0 }));
  const abandonedLogosRemoved = await sweepAbandonedLogos(pool).catch(() => 0);
  const ctx = { initiator: { kind: "system" as const, ref: "cron" }, executor: { kind: "system" as const, ref: "cron" } };
  const due = await prisma.ownershipTransfer.findMany({ where: { status: "pending", expiresAt: { lte: new Date() } }, select: { id: true }, take: 100 });
  let expiredTransfers = 0;
  for (const t of due) if (await prisma.$transaction((tx) => expireTransfer(tx, ctx, t.id)).catch(() => false)) expiredTransfers += 1;
  return Response.json({ expiredChangeNotices: notices.length, opsTold, expiredTransfers, deletionRequestsSent: deletions.sent, deletionDecisions: deletions.decided, accountsErased: deletions.erased, abandonedLogosRemoved });
}

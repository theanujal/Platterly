import "server-only";
import { prisma } from "@/lib/db";
import { identityPool } from "../auth/identity-db";
import { fetchOpsBilling } from "../store/ops-catalogue";
import { abandonPendingBusiness, registerPendingBusiness } from "../store/ops-checkout";
import { opsKeyFor } from "../store/keys";
import { purgeUnattachedUser } from "../users/purge";
import { runDeliveryBatch } from "../outbox/deliver";
import { getSender } from "../outbox/sender";
import { completeBusinessForPaidSignup, completePaidSignup, abandonPaidSignup, sweepPaidSignups, type OpsState, type Outcome, type PaidSignupDeps, type PendingSignup } from "./paid-signup";

type Row = { subject: string; clientId: string; planCode: string | null; interval: string | null; reservedBusinessId: string; email: string; name: string; phone: string | null; at: Date; verifiedAt: Date | null };
const SELECT = `select s."userId" as subject, s."clientId", s."planCode", s."interval", s."reservedBusinessId", u."email", u."name", u."phone", s."at", s."verifiedAt"
  from "signupProduct" s join "user" u on u.id = s."userId" where s."status" = 'pending_payment' and s."reservedBusinessId" is not null`;
const toPending = (r: Row): PendingSignup => ({ subject: r.subject, productKey: r.clientId, planCode: r.planCode, interval: r.interval, reservedBusinessId: r.reservedBusinessId, email: r.email, name: r.name, phone: r.phone, signedUpAt: r.at, verifiedAt: r.verifiedAt });

export async function findPendingSignup(subject: string): Promise<PendingSignup | null> {
  const { rows } = await identityPool().query<Row>(`${SELECT} and s."userId" = $1`, [subject]);
  return rows[0] ? toPending(rows[0]) : null;
}
export async function findPendingSignupByEmail(email: string): Promise<PendingSignup | null> {
  const { rows } = await identityPool().query<Row>(`${SELECT} and lower(u."email") = lower($1)`, [email]);
  return rows[0] ? toPending(rows[0]) : null;
}
export async function markPendingVerified(subject: string): Promise<void> {
  await identityPool().query(`update "signupProduct" set "verifiedAt" = now() where "userId" = $1 and "status" = 'pending_payment' and "verifiedAt" is null`, [subject]);
}

/** What Ops says about the business: paid, or not and how far the person got, or that Ops could not be asked. */
export async function opsStateOf(p: PendingSignup): Promise<OpsState> {
  const got = await fetchOpsBilling(p.reservedBusinessId);
  if (!got.ok) return got.reason === "not_found" ? { paid: false, step: "verified" } : { unknown: true };
  const entry = got.billing.products.find((x) => x.productKey === opsKeyFor(p.productKey));
  if (!entry) return { paid: false, step: "verified" };
  const b = entry.billing;
  if (b.payments.some((x) => x.paidAt) || b.subscription?.status === "ACTIVE") return { paid: true };
  const attempts = entry.attempts ?? [];
  if (attempts.some((a) => a.status === "FAILED")) return { paid: false, step: "payment_failed" };
  if (attempts.length > 0) return { paid: false, step: "payment_started" };
  return { paid: false, step: "opened_store" };
}

export function realDeps(): PaidSignupDeps {
  return {
    prisma,
    store: {
      find: findPendingSignup,
      list: async () => (await identityPool().query<Row>(SELECT)).rows.map(toPending),
      markCompleted: async (subject) => void (await identityPool().query(`update "signupProduct" set "status" = 'completed' where "userId" = $1`, [subject])),
      deleteIdentity: async (subject) => void (await identityPool().query(`delete from "user" where "id" = $1`, [subject])),
    },
    ops: {
      state: opsStateOf,
      abandon: async (p, step) => {
        const got = await abandonPendingBusiness({ businessId: p.reservedBusinessId, opsProductKey: opsKeyFor(p.productKey), name: p.name, email: p.email, phone: p.phone, planCode: p.planCode, interval: p.interval, step, signedUpAt: p.signedUpAt });
        return got.ok ? "ok" : got.reason === "conflict" ? "has_payment" : "failed";
      },
    },
    purgeUser: (subject) => purgeUnattachedUser(prisma, subject),
    completeBusiness: async (p) => {
      const made = await completeBusinessForPaidSignup(
        { prisma, readPerson: async (id) => (await identityPool().query<{ email: string; emailVerified: boolean; name: string }>(`select "email", "emailVerified", "name" from "user" where "id" = $1`, [id])).rows[0] ?? null },
        p,
      );
      // Hand the business to the product at once; a failed hand-over is retried by the outbox worker.
      if (made.ok) await runDeliveryBatch(prisma, getSender(), { limit: 10 }).catch((error) => console.error("[paid-signup] immediate hand-over failed:", error));
      return made;
    },
  };
}

/** Ops is told the business and product with no plan and no trial, so the Store's checkout has something to attach the payment to. */
export async function ensureOpsRegistration(p: PendingSignup): Promise<boolean> {
  const got = await registerPendingBusiness({ businessId: p.reservedBusinessId, opsProductKey: opsKeyFor(p.productKey), name: p.name, ownerName: p.name, ownerEmail: p.email, ownerPhone: p.phone });
  return got.ok;
}

export const completePaidSignupNow = (subject: string): Promise<Outcome> => completePaidSignup(realDeps(), subject).catch((error) => (console.error("[paid-signup] complete failed:", error), "unknown" as const));
export const abandonPaidSignupNow = (subject: string, step?: string): Promise<Outcome> => abandonPaidSignup(realDeps(), subject, step).catch((error) => (console.error("[paid-signup] abandon failed:", error), "unknown" as const));
export const sweepPaidSignupsNow = (now?: Date) => sweepPaidSignups(realDeps(), now);

import type { PrismaClient } from "@/generated/prisma/client";
import type { IdentityLinkClient } from "../users/identity-link";
import { linkVerifiedPerson } from "./business-created";
import { createOrganisation } from "./create";
import { placeholderBusinessName, signupIdempotencyKey } from "./signup-business";

// Paid-plan sign-up (AJ, 2026-11-14; docs/paid-plan-signup-plan.md, revision 3). A person who chose a paid plan has NO Platform business and NO product account until the
// payment succeeds. Three outcomes, each safe to repeat:
//   complete: the payment is confirmed, so the business is made under the id reserved at sign-up, with the person as Admin and the product attached and handed over.
//   abandon:  the payment window ended (or the same email signed up again) without payment: the person's details go to Ops's Abandoned-orders page and their sign-in
//             record, Platform user and Ops registration are removed, so the email is free. NEVER when anything was paid: Ops is asked first.
//   sweep:    the scheduled check. It completes every paid sign-up first (a person may pay and close the browser), and only then abandons the unpaid expired ones.

export type PendingSignup = {
  subject: string;
  productKey: string;
  planCode: string | null;
  interval: string | null;
  reservedBusinessId: string;
  email: string;
  name: string;
  phone: string | null;
  signedUpAt: Date;
  verifiedAt: Date | null;
};

/** What Ops says about a pending sign-up's business: paid or not, and how far the person got. `unknown` means Ops could not be asked, so nothing is decided. */
export type OpsState = { paid: true } | { paid: false; step: "verified" | "opened_store" | "payment_started" | "payment_failed" } | { unknown: true };

export type PaidSignupDeps = {
  prisma: Pick<PrismaClient, "$transaction">;
  /** The pending sign-up rows' storage (the identity database). */
  store: {
    find: (subject: string) => Promise<PendingSignup | null>;
    list: () => Promise<PendingSignup[]>;
    markCompleted: (subject: string) => Promise<void>;
    /** Removes the person's sign-in record (and with it the sign-up row). */
    deleteIdentity: (subject: string) => Promise<void>;
  };
  ops: {
    state: (p: PendingSignup) => Promise<OpsState>;
    /** Records the Abandoned-orders row and removes the registration. `has_payment` means Ops found a plan or a paid payment and removed nothing. */
    abandon: (p: PendingSignup, step: string) => Promise<"ok" | "has_payment" | "failed">;
  };
  /** The Platform's copy of the person, removed when it belongs to no business. */
  purgeUser: (subject: string) => Promise<boolean>;
  /** Makes the business under the reserved id and queues the hand-over (see completeBusiness). Injected so the rules above are testable. */
  completeBusiness: (p: PendingSignup) => Promise<{ ok: true } | { ok: false; reason: string }>;
};

export type Outcome = "completed" | "abandoned" | "kept" | "unknown" | "gone";

export async function completePaidSignup(deps: PaidSignupDeps, subject: string): Promise<Outcome> {
  const p = await deps.store.find(subject);
  if (!p) return "gone";
  const made = await deps.completeBusiness(p);
  if (!made.ok) return "unknown";
  await deps.store.markCompleted(subject);
  return "completed";
}

export async function abandonPaidSignup(deps: PaidSignupDeps, subject: string, fallbackStep: string = "verified"): Promise<Outcome> {
  const p = await deps.store.find(subject);
  if (!p) return "gone";
  const state = await deps.ops.state(p);
  if ("unknown" in state) return "unknown";
  if (state.paid) return completePaidSignup(deps, subject);
  const step = state.step ?? fallbackStep;
  const result = await deps.ops.abandon(p, step);
  if (result === "failed") return "unknown";
  if (result === "has_payment") return completePaidSignup(deps, subject);
  await deps.purgeUser(subject);
  await deps.store.deleteIdentity(subject);
  return "abandoned";
}

export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sweepPaidSignups(deps: PaidSignupDeps, now: Date = new Date(), windowMs: number = PAYMENT_WINDOW_MS): Promise<{ completed: number; abandoned: number; waiting: number }> {
  const out = { completed: 0, abandoned: 0, waiting: 0 };
  for (const p of await deps.store.list()) {
    const state = await deps.ops.state(p);
    if ("unknown" in state) {
      out.waiting += 1;
      continue;
    }
    if (state.paid) {
      if ((await completePaidSignup(deps, p.subject)) === "completed") out.completed += 1;
      else out.waiting += 1;
      continue;
    }
    const started = p.verifiedAt ?? p.signedUpAt;
    if (now.getTime() - started.getTime() < windowMs) {
      out.waiting += 1;
      continue;
    }
    const result = await abandonPaidSignup(deps, p.subject, state.step);
    if (result === "abandoned") out.abandoned += 1;
    else if (result === "completed") out.completed += 1;
    else out.waiting += 1;
  }
  return out;
}

/** The real `completeBusiness`: the same steps as the single sign-up, with the business id reserved at sign-up and the product attached only now. */
export async function completeBusinessForPaidSignup(deps: { prisma: PrismaClient; readPerson: (subject: string) => Promise<{ email: string; emailVerified: boolean; name: string } | null>; linkClient?: IdentityLinkClient }, p: PendingSignup): Promise<{ ok: true } | { ok: false; reason: string }> {
  const linked = await linkVerifiedPerson({ readPerson: deps.readPerson, linkClient: deps.linkClient }, p.subject);
  if (!linked.ok) return { ok: false, reason: linked.reason };
  const ref = `paid-signup:${p.productKey}`;
  const key = signupIdempotencyKey(p.subject, p.productKey);
  const result = await deps.prisma.$transaction((tx) =>
    createOrganisation(tx, { initiator: { kind: "system", ref }, executor: { kind: "system", ref }, requestId: key }, {
      userId: linked.userId,
      idempotencyKey: key,
      name: placeholderBusinessName(linked.person.name),
      productKey: p.productKey,
      organisationId: p.reservedBusinessId,
      queueLink: true,
    }),
  );
  return result.ok ? { ok: true } : { ok: false, reason: result.code };
}

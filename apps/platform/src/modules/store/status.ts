import { PAID_GRACE_DAYS, paymentGraceEnd, type SubscriptionStatus } from "@platterly/contract";

/**
 * How a subscription reads to a person (item 9). Ops stores ACTIVE during the 7-day grace after a paid period ends and LOCKED after it; `PAST_DUE` exists in the
 * list of statuses but nothing sets it. So "Payment due" is worked out here, from the dates, and is never stored: the same dates the products themselves lock by
 * (`paymentGraceEnd` in the contract), so what the Store says and what Caterly does cannot disagree.
 */
export type SubscriptionTone = "good" | "info" | "warn" | "bad" | "none";
export type SubscriptionDisplay = { state: "trial" | "trial_ended" | "active" | "ending" | "payment_due" | "ended_in_grace" | "locked" | "none"; label: string; tone: SubscriptionTone; detail: string };

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function describeSubscription(sub: { status: SubscriptionStatus; trialEndsAt?: string | null; currentPeriodEnd?: string | null; cancelledAt?: string | null; autoPay?: { status: string } | null } | null, now: Date = new Date()): SubscriptionDisplay {
  if (!sub) return { state: "none", label: "Not subscribed", tone: "none", detail: "Choose a plan to start." };
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  if (sub.status === "TRIALING") {
    const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : end;
    if (trialEnd && trialEnd.getTime() <= now.getTime()) return { state: "trial_ended", label: "Trial ended", tone: "bad", detail: "Your trial has ended. Choose a plan to restore access." };
    return { state: "trial", label: "On trial", tone: "info", detail: trialEnd ? `Your trial ends on ${date(trialEnd)}.` : "You are on a free trial." };
  }
  if (sub.status === "LOCKED" || sub.status === "CANCELLED") return { state: "locked", label: "Locked", tone: "bad", detail: "Access has ended. Choose a plan to restore it." };
  // ACTIVE (and PAST_DUE, should Ops ever set it): the dates decide. A monthly auto-pay whose renewal failed (Razorpay retrying, or stopped after its retries) reads
  // "Payment due" with its own wording, with or without the dates having run out (D-C, gate-c-decision-record.md; slice R4).
  const failed = !sub.cancelledAt && (sub.autoPay?.status === "PENDING" || sub.autoPay?.status === "HALTED");
  if (failed) {
    const graceEnds = end ? paymentGraceEnd(end) : null;
    if (graceEnds && now.getTime() >= graceEnds.getTime()) return { state: "locked", label: "Locked", tone: "bad", detail: `Your last payment did not go through and the ${PAID_GRACE_DAYS} days to pay have passed. Choose a plan to restore access.` };
    const keep = graceEnds && end && end.getTime() <= now.getTime() ? ` You keep full access until ${date(graceEnds)}.` : "";
    const retry = sub.autoPay?.status === "PENDING" ? " We will try your payment method again." : "";
    return { state: "payment_due", label: "Payment due", tone: "warn", detail: `Your last payment did not go through. Update your payment method or pay again to keep your plan.${retry}${keep}` };
  }
  if (end && end.getTime() <= now.getTime()) {
    const graceEnds = paymentGraceEnd(end);
    if (now.getTime() >= graceEnds.getTime()) return { state: "locked", label: "Locked", tone: "bad", detail: `Your plan ended on ${date(end)} and the ${PAID_GRACE_DAYS} days to renew have passed. Choose a plan to restore access.` };
    return sub.cancelledAt
      ? { state: "ended_in_grace", label: "Ended", tone: "warn", detail: `Your plan ended on ${date(end)}. You keep full access until ${date(graceEnds)}; choose a plan to continue after that.` }
      : { state: "payment_due", label: "Payment due", tone: "warn", detail: `Your paid days ended on ${date(end)}. You keep full access until ${date(graceEnds)}; pay before then to keep your plan.` };
  }
  if (sub.cancelledAt && end) return { state: "ending", label: "Ending", tone: "warn", detail: `You stopped renewal. Your plan stays active until ${date(end)}.` };
  return { state: "active", label: "Active", tone: "good", detail: end ? `Paid until ${date(end)}.` : "Your plan is active." };
}

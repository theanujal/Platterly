import type { BillingInterval } from "@/generated/prisma/enums";

/**
 * Chunk 20: the arithmetic of a subscription payment, kept free of the database so the paywall page, the
 * server and the tests all use the same numbers. Plan prices are BEFORE GST; GST is added on top.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A monthly plan buys 30 days, an annual plan 365 (the paywall promises "30-Day Premium Access"). */
export const INTERVAL_DAYS: Record<BillingInterval, number> = { MONTHLY: 30, ANNUAL: 365 };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface PriceBreakdown {
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
}

export function priceBreakdown(price: number, gstPercent: number): PriceBreakdown {
  const amount = round2(price);
  const gstAmount = round2((amount * gstPercent) / 100);
  return { amount, gstPercent, gstAmount, total: round2(amount + gstAmount) };
}

export function periodEndFrom(start: Date, interval: BillingInterval): Date {
  return new Date(start.getTime() + INTERVAL_DAYS[interval] * DAY_MS);
}

/** What paying yearly saves against twelve monthly payments (0 when yearly is not cheaper). */
export function annualSaving(priceMonthly: number, priceAnnual: number): number {
  return Math.max(0, round2(priceMonthly * 12 - priceAnnual));
}

export type BillingLockReason = "trial_ended" | "period_ended" | "ended";

export interface BillingStateInput {
  status: "TRIALING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * Is this kitchen locked out until it pays? A trial or a paid period that has run out locks it. A plan a Super Admin
 * assigned by hand has no period end and never locks by itself.
 */
export function billingLockReason(sub: BillingStateInput | null, now: Date = new Date()): BillingLockReason | null {
  if (!sub) return null;
  if (sub.status === "TRIALING") return sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime() ? "trial_ended" : null;
  if (sub.status === "ACTIVE") return sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= now.getTime() ? "period_ended" : null;
  return "ended";
}

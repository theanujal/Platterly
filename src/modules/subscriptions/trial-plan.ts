import "server-only";
import { prisma } from "@/lib/db";

export const TRIAL_PLAN_CODE = "trial";
const TRIAL_DURATION_DAYS = 7;

/**
 * Chunk 3 Group 3.3 — idempotent upsert, not a seed script. `update: {}`
 * means a Super Admin's later edits to the Trial plan (price, limits) are
 * never clobbered by a repeat call. Chunk 4's onboarding wizard must also
 * call this defensively before assigning the Trial plan to a new tenant —
 * nothing guarantees this row exists on a fresh CI checkout otherwise.
 */
export async function ensureTrialPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { code: TRIAL_PLAN_CODE },
    create: {
      code: TRIAL_PLAN_CODE,
      name: "Trial",
      description: "Free trial for new caterers, assigned automatically at signup.",
      isTrial: true,
      trialDurationDays: TRIAL_DURATION_DAYS,
      currency: "INR",
    },
    update: {},
  });
}

export async function getTrialPlan() {
  return prisma.subscriptionPlan.findUnique({ where: { code: TRIAL_PLAN_CODE } });
}

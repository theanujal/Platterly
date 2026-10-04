import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

export interface PlanLimits {
  maxUsers?: number;
  maxEvents?: number;
  maxOrders?: number;
  maxKitchens?: number;
  maxStores?: number;
  maxCustomers?: number;
  maxMenuLinks?: number;
  maxStorageMb?: number;
  maxReports?: number;
  maxWhatsappMessages?: number;
}

export interface PlanInput extends PlanLimits {
  code: string;
  name: string;
  description?: string;
  isTrial?: boolean;
  trialDurationDays?: number;
  // null clears a saved price (the plan stops being offered / stops being sold yearly).
  priceMonthly?: number | null;
  priceAnnual?: number | null;
  // Chunk 20: GST added on top of the prices, and the bullets shown on the payment page.
  gstPercent?: number;
  highlights?: string[];
  currency?: string;
}

/**
 * Chunk 3 Group 3.3 (PRD §9, §58). Definitions only — no live Razorpay
 * billing (Chunk 20). All limit fields are nullable; a null limit means
 * unlimited.
 */
function validatePricing(input: Partial<PlanInput>) {
  for (const [label, value] of [["Monthly price", input.priceMonthly], ["Yearly price", input.priceAnnual]] as const) {
    if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) throw new ValidationError(`${label} cannot be negative.`);
  }
  if (input.gstPercent !== undefined && (!Number.isFinite(input.gstPercent) || input.gstPercent < 0 || input.gstPercent > 100)) throw new ValidationError("GST must be between 0 and 100.");
}

export async function createPlan(input: PlanInput) {
  validatePricing(input);
  return prisma.subscriptionPlan.create({ data: input });
}

export async function updatePlan(id: string, input: Omit<PlanInput, "code">) {
  validatePricing(input);
  return prisma.subscriptionPlan.update({ where: { id }, data: input });
}

export async function listPlans() {
  return prisma.subscriptionPlan.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getPlan(id: string) {
  return prisma.subscriptionPlan.findUnique({ where: { id } });
}

/** Retire without deleting — Subscription's FK to this plan is onDelete: Restrict anyway. */
export async function deactivatePlan(id: string) {
  return prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
}

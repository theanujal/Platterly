import "server-only";
import { prisma } from "@/lib/db";

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
  priceMonthly?: number;
  priceAnnual?: number;
  currency?: string;
}

/**
 * Chunk 3 Group 3.3 (PRD §9, §58). Definitions only — no live Razorpay
 * billing (Chunk 20). All limit fields are nullable; a null limit means
 * unlimited.
 */
export async function createPlan(input: PlanInput) {
  return prisma.subscriptionPlan.create({ data: input });
}

export async function updatePlan(id: string, input: Omit<PlanInput, "code">) {
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

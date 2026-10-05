import "server-only";
import { validateEntitlements, type EntitlementValues, type ProductManifest } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reissueForPlan } from "@/modules/snapshots/issue";

export class PlanError extends Error {}

export interface PlanInput {
  productKey: string;
  code: string;
  name: string;
  description?: string;
  isTrial: boolean;
  trialDurationDays?: number | null;
  priceMonthly?: number | null;
  priceAnnual?: number | null;
  gstPercent: number;
  highlights: string[];
  entitlements: EntitlementValues;
}

async function validate(input: PlanInput, existingId?: string) {
  const product = await prisma.product.findUnique({ where: { key: input.productKey } });
  if (!product) throw new PlanError("Unknown product.");
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(code)) throw new PlanError("The plan code must be lowercase letters, digits or dashes, starting with a letter (up to 32 characters).");
  const name = input.name.trim();
  if (!name || name.length > 80) throw new PlanError("The plan name is required (up to 80 characters).");
  if (input.isTrial && !(Number.isInteger(input.trialDurationDays) && (input.trialDurationDays as number) >= 1 && (input.trialDurationDays as number) <= 365)) throw new PlanError("A trial plan needs a trial length of 1 to 365 days.");
  for (const [label, price] of [["monthly", input.priceMonthly], ["annual", input.priceAnnual]] as const) {
    if (price !== null && price !== undefined && !(Number.isFinite(price) && price >= 0 && price <= 10_000_000)) throw new PlanError(`The ${label} price must be a number from 0 up.`);
  }
  if (!(Number.isFinite(input.gstPercent) && input.gstPercent >= 0 && input.gstPercent <= 100)) throw new PlanError("GST must be between 0 and 100.");
  const manifest = product.manifest as unknown as ProductManifest | null;
  if (!manifest) throw new PlanError("Read this product's manifest first: its entitlement keys come from there.");
  const checked = validateEntitlements(manifest.entitlements, input.entitlements);
  if (!checked.ok) throw new PlanError(`Entitlements: ${checked.error}.`);
  const clash = await prisma.plan.findUnique({ where: { productKey_code: { productKey: input.productKey, code } } });
  if (clash && clash.id !== existingId) throw new PlanError(`This product already has a plan with the code "${code}".`);
  return { code, name, entitlements: checked.value };
}

const data = (input: PlanInput, clean: { code: string; name: string; entitlements: EntitlementValues }) => ({
  code: clean.code,
  name: clean.name,
  description: input.description?.trim() || null,
  isTrial: input.isTrial,
  trialDurationDays: input.isTrial ? input.trialDurationDays ?? null : null,
  priceMonthly: input.priceMonthly ?? null,
  priceAnnual: input.priceAnnual ?? null,
  gstPercent: input.gstPercent,
  highlights: input.highlights.map((h) => h.trim()).filter(Boolean),
  entitlements: clean.entitlements as Prisma.InputJsonValue,
});

export async function createPlan(input: PlanInput, actorUserId: string | null) {
  const clean = await validate(input);
  const plan = await prisma.plan.create({ data: { productKey: input.productKey, ...data(input, clean) } });
  await audit({ actorUserId, action: "plan.created", subject: plan.id, detail: { productKey: plan.productKey, code: plan.code } });
  return plan;
}

/** Saves a plan, then sends a fresh snapshot to every business currently on it, so a changed limit reaches the product. */
export async function updatePlan(id: string, input: PlanInput, actorUserId: string | null) {
  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) throw new PlanError("Plan not found.");
  if (existing.productKey !== input.productKey) throw new PlanError("A plan cannot move to another product.");
  const clean = await validate(input, id);
  const plan = await prisma.plan.update({ where: { id }, data: data(input, clean) });
  await audit({ actorUserId, action: "plan.updated", subject: id, detail: { productKey: plan.productKey, code: plan.code } });
  const reissued = await reissueForPlan(id);
  return { plan, reissued };
}

export async function setPlanActive(id: string, isActive: boolean, actorUserId: string | null) {
  await prisma.plan.update({ where: { id }, data: { isActive } });
  await audit({ actorUserId, action: isActive ? "plan.activated" : "plan.retired", subject: id });
}

export async function listPlans(productKey?: string) {
  return prisma.plan.findMany({ where: productKey ? { productKey } : {}, orderBy: [{ productKey: "asc" }, { isTrial: "desc" }, { priceMonthly: "asc" }], include: { product: { select: { name: true } }, _count: { select: { subscriptions: { where: { endDate: null } } } } } });
}

export async function getPlan(id: string) {
  return prisma.plan.findUnique({ where: { id }, include: { product: true } });
}

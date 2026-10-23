import "server-only";
import { validateEntitlements, type EntitlementValues, type ProductManifest } from "@platterly/contract";
import { Prisma, type Plan } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reissueForPlan } from "@/modules/snapshots/issue";
import { markSiteChanged } from "@/modules/site-content/site-content";

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
  /** The plan the website marks "Most popular". Left out on a save, the plan keeps what it has. */
  isFeatured?: boolean;
}

async function validate(input: PlanInput, existingId?: string, isActive = true) {
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
  if (input.isFeatured === true && !canBeFeatured({ isTrial: input.isTrial, priceMonthly: input.priceMonthly ?? null, isActive })) {
    throw new PlanError("Only an active plan with a monthly price can be featured on the website, and the trial cannot.");
  }
  const clash = await prisma.plan.findUnique({ where: { productKey_code: { productKey: input.productKey, code } } });
  if (clash && clash.id !== existingId) throw new PlanError(`This product already has a plan with the code "${code}".`);
  return { code, name, entitlements: checked.value };
}

/** Only an active plan with a monthly price, and not the trial, can be the featured one. */
export const canBeFeatured = (plan: { isTrial: boolean; priceMonthly: unknown; isActive: boolean }) => plan.isActive && !plan.isTrial && plan.priceMonthly !== null && plan.priceMonthly !== undefined;

const data = (input: PlanInput, clean: { code: string; name: string; entitlements: EntitlementValues }, isFeatured: boolean) => ({
  code: clean.code,
  name: clean.name,
  description: input.description?.trim() || null,
  isTrial: input.isTrial,
  trialDurationDays: input.isTrial ? input.trialDurationDays ?? null : null,
  priceMonthly: input.priceMonthly ?? null,
  priceAnnual: input.priceAnnual ?? null,
  gstPercent: input.gstPercent,
  // Each line once: the plan pages key their lists by the line (issue 91).
  highlights: [...new Set(input.highlights.map((h) => h.trim()).filter(Boolean))],
  entitlements: clean.entitlements as Prisma.InputJsonValue,
  isFeatured,
});

/**
 * Saves a plan; when it is featured, the product's other featured plan is cleared in the same transaction. The partial unique index
 * (plan_one_featured_per_product) is the backstop for two saves racing: the loser gets a clear message instead of a database error.
 */
async function savePlanRow(productKey: string, write: (tx: Prisma.TransactionClient) => Promise<Plan>, isFeatured: boolean, planId?: string): Promise<Plan> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (isFeatured) await tx.plan.updateMany({ where: { productKey, isFeatured: true, ...(planId ? { id: { not: planId } } : {}) }, data: { isFeatured: false } });
      return write(tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && JSON.stringify(error.meta ?? {}).includes("plan_one_featured_per_product")) {
      throw new PlanError("Another plan was just made the featured plan. Reload the plans and try again.");
    }
    throw error;
  }
}

/** What the marketing site shows of a plan (apps/site pricing cards, via the content bundle). Limits (entitlements) are not shown. */
type SitePlan = Pick<Plan, "productKey" | "name" | "description" | "isTrial" | "trialDurationDays" | "priceMonthly" | "priceAnnual" | "gstPercent" | "highlights" | "isActive" | "isFeatured">;
const siteView = (plan: SitePlan) => JSON.stringify([plan.name, plan.description, plan.isTrial, plan.trialDurationDays, plan.priceMonthly === null ? null : Number(plan.priceMonthly), plan.priceAnnual === null ? null : Number(plan.priceAnnual), Number(plan.gstPercent), plan.highlights, plan.isActive, plan.isFeatured]);
/** A plan is on the site while it is active and either the trial or has a monthly price (see buildBundle). */
const onSite = (plan: SitePlan) => plan.productKey === "catering" && plan.isActive && (plan.isTrial || plan.priceMonthly !== null);

/** The Unpublished changes badge: only a catering plan the site shows (before or after the save) whose site-visible fields changed. */
async function markSiteIfPlanChanged(before: SitePlan | null, after: SitePlan) {
  if (!(before && onSite(before)) && !onSite(after)) return;
  if (before && siteView(before) === siteView(after)) return;
  await markSiteChanged();
}

export async function createPlan(input: PlanInput, actorUserId: string | null) {
  const clean = await validate(input);
  const featured = input.isFeatured === true;
  const plan = await savePlanRow(input.productKey, (tx) => tx.plan.create({ data: { productKey: input.productKey, ...data(input, clean, featured) } }), featured);
  await audit({ actorUserId, action: "plan.created", subject: plan.id, detail: { productKey: plan.productKey, code: plan.code } });
  await markSiteIfPlanChanged(null, plan);
  return plan;
}

/** Saves a plan, then sends a fresh snapshot to every business currently on it, so a changed limit reaches the product. */
export async function updatePlan(id: string, input: PlanInput, actorUserId: string | null) {
  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) throw new PlanError("Plan not found.");
  if (existing.productKey !== input.productKey) throw new PlanError("A plan cannot move to another product.");
  const clean = await validate(input, id, existing.isActive);
  // Left out on the save, the plan keeps its flag; a featured plan that stops being eligible (trial, no monthly price) loses it.
  const featured = (input.isFeatured ?? existing.isFeatured) && canBeFeatured({ isTrial: input.isTrial, priceMonthly: input.priceMonthly ?? null, isActive: existing.isActive });
  const plan = await savePlanRow(input.productKey, (tx) => tx.plan.update({ where: { id }, data: data(input, clean, featured) }), featured, id);
  await audit({ actorUserId, action: "plan.updated", subject: id, detail: { productKey: plan.productKey, code: plan.code } });
  await markSiteIfPlanChanged(existing, plan);
  const reissued = await reissueForPlan(id);
  return { plan, reissued };
}

export async function setPlanActive(id: string, isActive: boolean, actorUserId: string | null) {
  const existing = await prisma.plan.findUnique({ where: { id } });
  // A retired plan cannot be the featured one.
  const plan = await prisma.plan.update({ where: { id }, data: { isActive, ...(isActive ? {} : { isFeatured: false }) } });
  await audit({ actorUserId, action: isActive ? "plan.activated" : "plan.retired", subject: id });
  await markSiteIfPlanChanged(existing, plan);
}

export async function listPlans(productKey?: string) {
  return prisma.plan.findMany({ where: productKey ? { productKey } : {}, orderBy: [{ productKey: "asc" }, { isTrial: "desc" }, { priceMonthly: "asc" }], include: { product: { select: { name: true } }, _count: { select: { subscriptions: { where: { endDate: null } } } } } });
}

export async function getPlan(id: string) {
  return prisma.plan.findUnique({ where: { id }, include: { product: true } });
}

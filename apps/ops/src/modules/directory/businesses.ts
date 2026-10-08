import "server-only";
import { prisma } from "@/lib/db";

export const PAGE_SIZE = 24;

export type PlanFilter = "trialing" | "paying" | "locked" | "none";
export type BusinessSort = "newest" | "oldest" | "name";
export const PLAN_FILTERS: { value: PlanFilter; label: string }[] = [
  { value: "trialing", label: "On trial" },
  { value: "paying", label: "Paying" },
  { value: "locked", label: "Locked" },
  { value: "none", label: "No plan" },
];

export interface BusinessQuery {
  q?: string;
  productKey?: string;
  status?: "ACTIVE" | "SUSPENDED" | "PENDING_DELETE";
  plan?: PlanFilter;
  sort?: BusinessSort;
  page?: number;
}

/** What a business's current subscription looks like in the plan filter (on the picked product, or any product). */
function planWhere(plan: PlanFilter | undefined, productKey: string | undefined) {
  if (!plan) return {};
  const current = { endDate: null, ...(productKey ? { productKey } : {}) };
  if (plan === "none") return { subscriptions: { none: current } };
  if (plan === "trialing") return { subscriptions: { some: { ...current, status: "TRIALING" as const } } };
  if (plan === "locked") return { subscriptions: { some: { ...current, status: "LOCKED" as const } } };
  return { subscriptions: { some: { ...current, status: "ACTIVE" as const, plan: { isTrial: false } } } };
}

/** `q` matches the name or the owner's email. Each row carries its products and current subscriptions for the cards. */
export async function listBusinesses(opts: BusinessQuery = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { ownerEmail: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(opts.productKey ? { products: { some: { productKey: opts.productKey } } } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...planWhere(opts.plan, opts.productKey),
  };
  const orderBy = opts.sort === "name" ? { name: "asc" as const } : opts.sort === "oldest" ? { createdAt: "asc" as const } : { createdAt: "desc" as const };
  const [rows, total] = await Promise.all([
    prisma.business.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: {
        products: { include: { product: { select: { name: true } } } },
        subscriptions: { where: { endDate: null }, include: { plan: { select: { name: true, isTrial: true } } } },
      },
    }),
    prisma.business.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getBusiness(id: string) {
  return prisma.business.findUnique({
    where: { id },
    include: { products: { include: { product: { select: { name: true, baseUrl: true, manifest: true } } } }, notifications: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

/** What the business's Activity, Messages and Payments tabs show. Audit entries about a business carry its id as the subject. */
export async function getBusinessActivity(id: string) {
  const [audit, messages, payments] = await Promise.all([
    prisma.auditLog.findMany({ where: { subject: id }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { name: true } } } }),
    prisma.messageLog.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.subscriptionPayment.findMany({ where: { businessId: id, status: "PAID" }, orderBy: { paidAt: "desc" }, take: 20, include: { plan: { select: { name: true } } } }),
  ]);
  return { audit, messages, payments };
}

import "server-only";
import { prisma } from "@/lib/db";

export const PAGE_SIZE = 25;

/** Newest first; `q` matches the name or the owner's email. */
export async function listBusinesses(opts: { q?: string; productKey?: string; page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const where = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { ownerEmail: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(opts.productKey ? { products: { some: { productKey: opts.productKey } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.business.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { products: { include: { product: { select: { name: true } } } } } }),
    prisma.business.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getBusiness(id: string) {
  return prisma.business.findUnique({
    where: { id },
    include: { products: { include: { product: { select: { name: true, baseUrl: true, manifest: true } } } }, alerts: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

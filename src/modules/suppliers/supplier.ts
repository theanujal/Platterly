import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit/audit";
import { RULES, validateInput, checkPhone } from "@/lib/validation";

export interface SupplierInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  isActive?: boolean;
}

/** One inventory item a supplier provides, and whether this supplier is the preferred one for it. */
export interface SupplierProductInput {
  inventoryId: string;
  isPreferred: boolean;
}

export class SupplierInUseError extends Error {}
export class DuplicateSupplierError extends Error {}

function validate(input: SupplierInput) {
  validateInput(input, RULES.supplier);
  if (input.phone?.trim()) checkPhone(input.phone);
}

function clean(input: SupplierInput) {
  const trim = (v?: string) => v?.trim() || null;
  return {
    name: input.name.trim(),
    contactPerson: trim(input.contactPerson),
    phone: trim(input.phone),
    email: trim(input.email),
    address: trim(input.address),
    gstin: trim(input.gstin)?.toUpperCase() ?? null,
    notes: trim(input.notes),
  };
}

/** Names are unique per kitchen, ignoring case ("ABC Traders" and "abc traders" are one supplier). */
async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.supplier.findFirst({
    where: { organizationId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new DuplicateSupplierError(`A supplier called "${name}" already exists.`);
}


/** Rejects duplicates and items that are not this kitchen's own, before anything is written. */
async function assertProducts(organizationId: string, products: SupplierProductInput[]) {
  const ids = products.map((p) => p.inventoryId);
  if (new Set(ids).size !== ids.length) throw new Error("An inventory item can only be listed once for a supplier.");
  if (ids.length === 0) return;
  const found = await prisma.inventory.count({ where: { organizationId, id: { in: ids } } });
  if (found !== ids.length) throw new Error("One of the selected inventory items was not found.");
}

/**
 * Makes the supplier's mappings exactly `products`: removes the others, adds the new, and keeps one preferred supplier per
 * item (marking this supplier preferred clears the flag on whichever supplier had it). Runs inside the caller's transaction.
 * The partial unique index is the backstop if two people do this at the same moment.
 */
async function applyProducts(tx: Prisma.TransactionClient, organizationId: string, supplierId: string, products: SupplierProductInput[]) {
  await tx.supplierItem.deleteMany({ where: { supplierId, inventoryId: { notIn: products.map((p) => p.inventoryId) } } });
  for (const product of products) {
    if (product.isPreferred) {
      await tx.supplierItem.updateMany({ where: { organizationId, inventoryId: product.inventoryId, supplierId: { not: supplierId }, isPreferred: true }, data: { isPreferred: false } });
    }
    await tx.supplierItem.upsert({
      where: { supplierId_inventoryId: { supplierId, inventoryId: product.inventoryId } },
      create: { organizationId, supplierId, inventoryId: product.inventoryId, isPreferred: product.isPreferred },
      update: { isPreferred: product.isPreferred },
    });
  }
}

function conflictMessage(error: unknown): never {
  if (typeof error === "object" && error && (error as { code?: string }).code === "P2002") {
    throw new Error("These products were just changed by someone else. Reload and try again.");
  }
  throw error;
}

/** Every inventory item a supplier can be mapped to, for the Products Supplied picker. */
export async function listProductOptions(organizationId: string) {
  return prisma.inventory.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true, unit: true } });
}

export async function createSupplier(organizationId: string, input: SupplierInput, actorUserId: string, products: SupplierProductInput[] = []) {
  validate(input);
  const data = clean(input);
  await assertNameFree(organizationId, data.name);
  await assertProducts(organizationId, products);
  // The supplier and its mappings are saved together or not at all.
  const supplier = await prisma
    .$transaction(async (tx) => {
      const created = await tx.supplier.create({ data: { organizationId, ...data, isActive: input.isActive ?? true } });
      await applyProducts(tx, organizationId, created.id, products);
      return created;
    })
    .catch(conflictMessage);
  await audit({ organizationId, actorUserId, action: "supplier.create", recordType: "Supplier", recordId: supplier.id, after: JSON.parse(JSON.stringify(supplier)) });
  return supplier;
}

/** `products` undefined leaves the mappings as they are; an empty list removes them all. */
export async function updateSupplier(organizationId: string, id: string, input: SupplierInput, actorUserId: string, products?: SupplierProductInput[]) {
  validate(input);
  const before = await prisma.supplier.findFirstOrThrow({ where: { id, organizationId } });
  const data = clean(input);
  await assertNameFree(organizationId, data.name, id);
  if (products) await assertProducts(organizationId, products);
  const after = await prisma
    .$transaction(async (tx) => {
      const updated = await tx.supplier.update({ where: { id }, data: { ...data, isActive: input.isActive ?? before.isActive } });
      if (products) await applyProducts(tx, organizationId, id, products);
      return updated;
    })
    .catch(conflictMessage);
  // Expenses keep the name as it was when they were booked, except those that point here: keep them in step.
  if (before.name !== after.name) {
    await prisma.expense.updateMany({ where: { organizationId, supplierId: id }, data: { supplierName: after.name } });
    await prisma.recurringExpense.updateMany({ where: { organizationId, supplierId: id }, data: { supplierName: after.name } });
  }
  await audit({ organizationId, actorUserId, action: "supplier.update", recordType: "Supplier", recordId: id, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)) });
  return after;
}

export async function setSupplierActive(organizationId: string, id: string, isActive: boolean, actorUserId: string) {
  const before = await prisma.supplier.findFirstOrThrow({ where: { id, organizationId } });
  const after = await prisma.supplier.update({ where: { id }, data: { isActive } });
  await audit({ organizationId, actorUserId, action: "supplier.update", recordType: "Supplier", recordId: id, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)) });
  return after;
}

/** Refuses while anything points at the supplier; deactivate it instead. */
export async function deleteSupplier(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.supplier.findFirstOrThrow({ where: { id, organizationId } });
  const [items, expenses, repeating, orders, payments] = await Promise.all([
    prisma.inventory.count({ where: { supplierId: id } }),
    prisma.expense.count({ where: { supplierId: id } }),
    prisma.recurringExpense.count({ where: { supplierId: id } }),
    prisma.purchaseOrder.count({ where: { supplierId: id } }),
    prisma.supplierPayment.count({ where: { supplierId: id } }),
  ]);
  if (items + expenses + repeating + orders + payments > 0) {
    throw new SupplierInUseError(`"${before.name}" is used by ${items} inventory item(s), ${expenses + repeating} expense(s) and ${orders} purchase order(s). Deactivate it instead.`);
  }
  await prisma.supplier.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "supplier.delete", recordType: "Supplier", recordId: id, before: JSON.parse(JSON.stringify(before)) });
}

/** Every supplier with how many inventory items and how much spend point at it, for the list. */
export async function listSuppliers(organizationId: string) {
  const [suppliers, spend] = await Promise.all([
    prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { inventoryItems: true, expenses: true } }, products: { select: { inventoryId: true, isPreferred: true } } } }),
    prisma.expense.groupBy({ by: ["supplierId"], where: { organizationId, supplierId: { not: null } }, _sum: { amount: true } }),
  ]);
  const spendBySupplier = new Map(spend.map((s) => [s.supplierId, Number(s._sum.amount ?? 0)]));
  return suppliers.map((s) => ({ ...s, totalSpend: spendBySupplier.get(s.id) ?? 0 }));
}

/** Profile data: the items they supply and the expenses booked against them (their purchase history until 18.3's orders). */
export async function getSupplierProfile(organizationId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!supplier) return null;
  const [items, expenses, spend] = await Promise.all([
    prisma.inventory.findMany({ where: { organizationId, supplierId: id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, stockCount: true, costPerUnit: true } }),
    prisma.expense.findMany({ where: { organizationId, supplierId: id }, orderBy: { spentAt: "desc" }, take: 50, select: { id: true, category: true, amount: true, spentAt: true, orderId: true, notes: true } }),
    prisma.expense.aggregate({ where: { organizationId, supplierId: id }, _sum: { amount: true } }),
  ]);
  return { supplier, items, expenses, totalSpend: Number(spend._sum.amount ?? 0) };
}

/** Active suppliers for pickers (inventory form, expense form). */
export async function listSupplierOptions(organizationId: string, includeId?: string | null) {
  return prisma.supplier.findMany({
    where: { organizationId, OR: [{ isActive: true }, ...(includeId ? [{ id: includeId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Resolves a picked supplier to its name for the expense snapshot; throws for another kitchen's id. */
export async function resolveSupplierName(organizationId: string, supplierId: string): Promise<string> {
  const s = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId }, select: { name: true } });
  if (!s) throw new Error("That supplier was not found.");
  return s.name;
}

/**
 * The two columns an expense stores. A picked supplier wins and its name is copied in; otherwise the typed name
 * stands on its own (a one-off shop that isn't worth a supplier record).
 */
export async function resolveSupplierFields(organizationId: string, input: { supplierId?: string | null; supplierName?: string | null }) {
  if (input.supplierId) return { supplierId: input.supplierId, supplierName: await resolveSupplierName(organizationId, input.supplierId) };
  return { supplierId: null, supplierName: input.supplierName?.trim() || null };
}

/** supplierId -> the inventory items it provides (Products Supplied), for the purchase order form. */
export async function listSupplierProductMap(organizationId: string): Promise<Record<string, string[]>> {
  const rows = await prisma.supplierItem.findMany({ where: { organizationId }, select: { supplierId: true, inventoryId: true } });
  const map: Record<string, string[]> = {};
  for (const r of rows) (map[r.supplierId] ??= []).push(r.inventoryId);
  return map;
}

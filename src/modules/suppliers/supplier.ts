import "server-only";
import { prisma } from "@/lib/db";
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

export async function createSupplier(organizationId: string, input: SupplierInput, actorUserId: string) {
  validate(input);
  const data = clean(input);
  await assertNameFree(organizationId, data.name);
  const supplier = await prisma.supplier.create({ data: { organizationId, ...data, isActive: input.isActive ?? true } });
  await audit({ organizationId, actorUserId, action: "supplier.create", recordType: "Supplier", recordId: supplier.id, after: JSON.parse(JSON.stringify(supplier)) });
  return supplier;
}

export async function updateSupplier(organizationId: string, id: string, input: SupplierInput, actorUserId: string) {
  validate(input);
  const before = await prisma.supplier.findFirstOrThrow({ where: { id, organizationId } });
  const data = clean(input);
  await assertNameFree(organizationId, data.name, id);
  const after = await prisma.supplier.update({ where: { id }, data: { ...data, isActive: input.isActive ?? before.isActive } });
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
    prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { inventoryItems: true, expenses: true } } } }),
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

import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createSupplier,
  updateSupplier,
  setSupplierActive,
  deleteSupplier,
  listSuppliers,
  listSupplierOptions,
  getSupplierProfile,
  resolveSupplierFields,
  SupplierInUseError,
  DuplicateSupplierError,
} from "@/modules/suppliers/supplier";
import { createInventoryItem, updateInventoryItem } from "@/modules/inventory/inventory";
import { createExpense } from "@/modules/expenses/expense";
import { createRecurringExpense, generateDueRecurringExpenses } from "@/modules/expenses/recurring";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.expense.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.recurringExpense.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Sup Org", slug: `sup-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  return { org, actor };
}

describe("Suppliers (Chunk 18.2)", () => {
  it("creates a supplier, trims fields, upper-cases GSTIN, audit-logs it", async () => {
    const { org, actor } = await setup();
    const s = await createSupplier(org.id, { name: "  ABC Traders ", phone: "+91 98765 43210", gstin: "29abcde1234f1z5", email: "a@b.in" }, actor.id);
    expect(s.name).toBe("ABC Traders");
    expect(s.gstin).toBe("29ABCDE1234F1Z5");
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "supplier.create" } })).toBe(1);
  });

  it("rejects a bad phone, a bad email and a duplicate name (ignoring case), but allows the same name in another kitchen", async () => {
    const a = await setup();
    const b = await setup();
    await createSupplier(a.org.id, { name: "ABC Traders" }, a.actor.id);
    await expect(createSupplier(a.org.id, { name: "abc traders" }, a.actor.id)).rejects.toBeInstanceOf(DuplicateSupplierError);
    await expect(createSupplier(a.org.id, { name: "X", phone: "abc" }, a.actor.id)).rejects.toThrow();
    await expect(createSupplier(a.org.id, { name: "Y", email: "nope" }, a.actor.id)).rejects.toThrow();
    await expect(createSupplier(b.org.id, { name: "ABC Traders" }, b.actor.id)).resolves.toBeTruthy();
  });

  it("renaming keeps the expenses that point at it in step", async () => {
    const { org, actor } = await setup();
    const s = await createSupplier(org.id, { name: "Old Name" }, actor.id);
    const e = await createExpense(org.id, null, { category: "RENT", amount: 100, spentAt: new Date(), supplierId: s.id }, actor.id);
    expect(e.supplierName).toBe("Old Name");
    await updateSupplier(org.id, s.id, { name: "New Name" }, actor.id);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: e.id } })).supplierName).toBe("New Name");
  });

  it("a typed name still works with no supplier picked; another kitchen's supplier is refused", async () => {
    const a = await setup();
    const b = await setup();
    const typed = await createExpense(a.org.id, null, { category: "RENT", amount: 10, spentAt: new Date(), supplierName: " One-off Shop " }, a.actor.id);
    expect(typed.supplierId).toBeNull();
    expect(typed.supplierName).toBe("One-off Shop");
    const other = await createSupplier(b.org.id, { name: "Theirs" }, b.actor.id);
    await expect(resolveSupplierFields(a.org.id, { supplierId: other.id })).rejects.toThrow();
    await expect(createInventoryItem(a.org.id, { name: "Rice", category: "Grains", unit: "kg", supplierId: other.id }, a.actor.id)).rejects.toThrow();
  });

  it("inventory items link to a supplier and the profile lists them, with spend from expenses", async () => {
    const { org, actor } = await setup();
    const s = await createSupplier(org.id, { name: "Grain Co" }, actor.id);
    const item = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg", supplierId: s.id }, actor.id);
    await createExpense(org.id, null, { category: "MISC", amount: 250, spentAt: new Date(), supplierId: s.id }, actor.id);
    const profile = await getSupplierProfile(org.id, s.id);
    expect(profile?.items.map((i) => i.id)).toEqual([item.id]);
    expect(profile?.totalSpend).toBe(250);
    const list = await listSuppliers(org.id);
    expect(list[0]._count.inventoryItems).toBe(1);
    expect(list[0].totalSpend).toBe(250);
    expect(await getSupplierProfile(org.id, "nope")).toBeNull();
    await updateInventoryItem(org.id, item.id, { name: "Rice", category: "Grains", unit: "kg", supplierId: null }, actor.id);
    expect((await getSupplierProfile(org.id, s.id))?.items).toHaveLength(0);
  });

  it("delete is refused while in use, allowed when free; inactive suppliers leave the pickers", async () => {
    const { org, actor } = await setup();
    const s = await createSupplier(org.id, { name: "Used" }, actor.id);
    await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg", supplierId: s.id }, actor.id);
    await expect(deleteSupplier(org.id, s.id, actor.id)).rejects.toBeInstanceOf(SupplierInUseError);
    await setSupplierActive(org.id, s.id, false, actor.id);
    expect(await listSupplierOptions(org.id)).toHaveLength(0);
    expect(await listSupplierOptions(org.id, s.id)).toHaveLength(1);
    const free = await createSupplier(org.id, { name: "Free" }, actor.id);
    await deleteSupplier(org.id, free.id, actor.id);
    expect(await prisma.supplier.count({ where: { id: free.id } })).toBe(0);
  });

  it("repeating expenses keep their supplier when they book", async () => {
    const { org, actor } = await setup();
    const s = await createSupplier(org.id, { name: "Landlord" }, actor.id);
    await createRecurringExpense(org.id, { category: "RENT", amount: 5000, frequency: "MONTHLY", startDate: new Date(Date.now() - 40 * 86400000), supplierId: s.id }, actor.id);
    expect(await generateDueRecurringExpenses(org.id)).toBeGreaterThan(0);
    const booked = await prisma.expense.findMany({ where: { organizationId: org.id } });
    expect(booked.every((e) => e.supplierId === s.id && e.supplierName === "Landlord")).toBe(true);
  });
});

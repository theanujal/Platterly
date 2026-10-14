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
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplierPayment.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("Products Supplied (supplier to inventory mapping)", () => {
  async function item(orgId: string, actorId: string, name: string) {
    return createInventoryItem(orgId, { name, category: "Dairy", unit: "kg" }, actorId);
  }
  const mappings = (supplierId: string) => prisma.supplierItem.findMany({ where: { supplierId }, orderBy: { createdAt: "asc" } });

  it("creates a supplier with no products, or with several, in one go", async () => {
    const { org, actor } = await setup();
    const a = await item(org.id, actor.id, "Paneer");
    const b = await item(org.id, actor.id, "Milk");
    const none = await createSupplier(org.id, { name: "Plain" }, actor.id);
    expect(await mappings(none.id)).toHaveLength(0);
    const two = await createSupplier(org.id, { name: "Dairy Co" }, actor.id, [{ inventoryId: a.id, isPreferred: true }, { inventoryId: b.id, isPreferred: false }]);
    const rows = await mappings(two.id);
    expect(rows.map((r) => [r.inventoryId, r.isPreferred]).sort()).toEqual([[a.id, true], [b.id, false]].sort());
  });

  it("an item can have several suppliers, and only one of them preferred; naming another preferred moves the flag", async () => {
    const { org, actor } = await setup();
    const paneer = await item(org.id, actor.id, "Paneer");
    const milk = await item(org.id, actor.id, "Milk");
    const s1 = await createSupplier(org.id, { name: "S1" }, actor.id, [{ inventoryId: paneer.id, isPreferred: true }]);
    // Not preferred automatically, even as the only mapping or the second supplier.
    const s2 = await createSupplier(org.id, { name: "S2" }, actor.id, [{ inventoryId: paneer.id, isPreferred: false }, { inventoryId: milk.id, isPreferred: true }]);
    expect((await mappings(s2.id)).find((r) => r.inventoryId === paneer.id)?.isPreferred).toBe(false);
    expect(await prisma.supplierItem.count({ where: { inventoryId: paneer.id } })).toBe(2);
    // Preferred for one item, not for another, on the same supplier
    expect((await mappings(s2.id)).find((r) => r.inventoryId === milk.id)?.isPreferred).toBe(true);

    await updateSupplier(org.id, s2.id, { name: "S2" }, actor.id, [{ inventoryId: paneer.id, isPreferred: true }, { inventoryId: milk.id, isPreferred: true }]);
    expect((await mappings(s1.id))[0].isPreferred).toBe(false);
    expect(await prisma.supplierItem.count({ where: { inventoryId: paneer.id, isPreferred: true } })).toBe(1);
  });

  it("the database itself refuses a second preferred supplier for an item", async () => {
    const { org, actor } = await setup();
    const paneer = await item(org.id, actor.id, "Paneer");
    const s1 = await createSupplier(org.id, { name: "S1" }, actor.id, [{ inventoryId: paneer.id, isPreferred: true }]);
    const s2 = await createSupplier(org.id, { name: "S2" }, actor.id);
    expect(s1.id).not.toBe(s2.id);
    await expect(prisma.supplierItem.create({ data: { organizationId: org.id, supplierId: s2.id, inventoryId: paneer.id, isPreferred: true } })).rejects.toThrow();
    await expect(prisma.supplierItem.create({ data: { organizationId: org.id, supplierId: s1.id, inventoryId: paneer.id } })).rejects.toThrow(); // and a repeat mapping
  });

  it("editing: add, change the preferred flag, remove, and leave them alone when no list is sent; removing a mapping keeps the item", async () => {
    const { org, actor } = await setup();
    const a = await item(org.id, actor.id, "Paneer");
    const b = await item(org.id, actor.id, "Milk");
    const s = await createSupplier(org.id, { name: "S" }, actor.id, [{ inventoryId: a.id, isPreferred: false }]);
    await updateSupplier(org.id, s.id, { name: "S renamed" }, actor.id); // no list: untouched
    expect(await mappings(s.id)).toHaveLength(1);
    await updateSupplier(org.id, s.id, { name: "S renamed" }, actor.id, [{ inventoryId: a.id, isPreferred: true }, { inventoryId: b.id, isPreferred: false }]);
    expect((await mappings(s.id)).find((r) => r.inventoryId === a.id)?.isPreferred).toBe(true);
    expect(await mappings(s.id)).toHaveLength(2); // no duplicate row for the item that was already mapped
    await updateSupplier(org.id, s.id, { name: "S renamed" }, actor.id, [{ inventoryId: b.id, isPreferred: false }]);
    expect((await mappings(s.id)).map((r) => r.inventoryId)).toEqual([b.id]);
    await updateSupplier(org.id, s.id, { name: "S renamed" }, actor.id, []); // remove all
    expect(await mappings(s.id)).toHaveLength(0);
    expect(await prisma.inventory.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
  });

  it("deactivating keeps the mappings; the supplier leaves the pickers", async () => {
    const { org, actor } = await setup();
    const a = await item(org.id, actor.id, "Paneer");
    const s = await createSupplier(org.id, { name: "S" }, actor.id, [{ inventoryId: a.id, isPreferred: true }]);
    await setSupplierActive(org.id, s.id, false, actor.id);
    expect(await mappings(s.id)).toHaveLength(1);
    expect(await listSupplierOptions(org.id)).toHaveLength(0);
  });

  it("rejects duplicates and another kitchen's items, and a failed create leaves no supplier behind", async () => {
    const mine = await setup();
    const other = await setup();
    const a = await item(mine.org.id, mine.actor.id, "Paneer");
    const theirs = await item(other.org.id, other.actor.id, "Their Rice");
    await expect(createSupplier(mine.org.id, { name: "Dup" }, mine.actor.id, [{ inventoryId: a.id, isPreferred: false }, { inventoryId: a.id, isPreferred: true }])).rejects.toThrow(/once/);
    await expect(createSupplier(mine.org.id, { name: "Cross" }, mine.actor.id, [{ inventoryId: theirs.id, isPreferred: false }])).rejects.toThrow(/not found/);
    expect(await prisma.supplier.count({ where: { organizationId: mine.org.id } })).toBe(0);
    const s = await createSupplier(mine.org.id, { name: "Ok" }, mine.actor.id);
    await expect(updateSupplier(mine.org.id, s.id, { name: "Ok" }, mine.actor.id, [{ inventoryId: theirs.id, isPreferred: false }])).rejects.toThrow(/not found/);
    // another kitchen cannot map to this kitchen's supplier either
    await expect(updateSupplier(other.org.id, s.id, { name: "Ok" }, other.actor.id, [])).rejects.toThrow();
    expect(await prisma.supplierItem.count({ where: { supplierId: s.id } })).toBe(0);
  });

  it("deleting an unused supplier removes its mappings but not the items; mappings do not block the delete", async () => {
    const { org, actor } = await setup();
    const a = await item(org.id, actor.id, "Paneer");
    const s = await createSupplier(org.id, { name: "S" }, actor.id, [{ inventoryId: a.id, isPreferred: true }]);
    await deleteSupplier(org.id, s.id, actor.id);
    expect(await prisma.supplierItem.count({ where: { inventoryId: a.id } })).toBe(0);
    expect(await prisma.inventory.count({ where: { id: a.id } })).toBe(1);
  });
});

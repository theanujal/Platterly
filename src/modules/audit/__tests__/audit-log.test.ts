import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { AUDIT_PAGE_SIZE, listAuditLog } from "../audit-log";

let orgA = "";
let orgB = "";
let alice = "";
let bob = "";
const userIds: string[] = [];

beforeAll(async () => {
  const mk = async (label: string) => {
    const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: label, slug: `aud-${label}-${crypto.randomUUID().slice(0, 6)}`, createdAt: new Date() } });
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: `User ${label}`, email: `aud-${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    return { org, user };
  };
  const a = await mk("a");
  const b = await mk("b");
  [orgA, orgB, alice, bob] = [a.org.id, b.org.id, a.user.id, b.user.id];

  await audit({ organizationId: orgA, actorUserId: alice, action: "order.create", recordType: "Order", recordId: "ord_1", after: { orderNumber: "ORD-1", total: 400 } });
  await audit({ organizationId: orgA, actorUserId: alice, action: "customer.update", recordType: "Customer", recordId: "cus_1", before: { name: "Old" }, after: { name: "New" } });
  await audit({ organizationId: orgA, action: "recurring_expense.generate", recordType: "RecurringExpense", recordId: "rec_1" });
  await audit({ organizationId: orgB, actorUserId: bob, action: "order.create", recordType: "Order", recordId: "ord_B", after: { orderNumber: "SECRET-B" } });
  await prisma.auditLog.create({ data: { organizationId: orgA, action: "expense.create", recordType: "Expense", recordId: "exp_old", createdAt: new Date("2026-01-15T10:00:00Z") } });
  // enough rows to need a second page
  await prisma.auditLog.createMany({ data: Array.from({ length: AUDIT_PAGE_SIZE + 5 }, (_, i) => ({ organizationId: orgB, action: "customer.create", recordType: "Customer", recordId: `bulk_${i}`, createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)) })) });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("listAuditLog", () => {
  it("shows only the asking kitchen's entries, newest first, in plain words", async () => {
    const log = await listAuditLog(orgA);
    expect(log.total).toBe(4);
    expect(log.entries.map((e) => e.recordId)).not.toContain("ord_B");
    expect(JSON.stringify(log)).not.toContain("SECRET-B");
    const order = log.entries.find((e) => e.recordId === "ord_1")!;
    expect(order).toMatchObject({ who: "User a", summary: "Order created", href: "/orders/ord_1" });
    // (the database stores JSON keys in its own order, so compare as a set)
    expect(order.changes).toHaveLength(2);
    expect(order.changes).toEqual(expect.arrayContaining([{ field: "Order Number", before: "—", after: "ORD-1" }, { field: "Total", before: "—", after: "400" }]));
    expect(log.entries.find((e) => e.recordId === "rec_1")).toMatchObject({ who: "System", summary: "Repeating expense booked" });
    expect(log.entries.at(-1)!.recordId).toBe("exp_old"); // oldest last
  });

  it("filters by record type, person, date range and search", async () => {
    expect((await listAuditLog(orgA, { recordType: "Customer" })).entries.map((e) => e.recordId)).toEqual(["cus_1"]);
    expect((await listAuditLog(orgA, { actorId: alice })).total).toBe(2);
    expect((await listAuditLog(orgA, { actorId: "none" })).total).toBe(2); // system and customers
    expect((await listAuditLog(orgA, { from: new Date("2026-01-15"), to: new Date("2026-01-15") })).entries.map((e) => e.recordId)).toEqual(["exp_old"]);
    expect((await listAuditLog(orgA, { search: "user a" })).total).toBe(2); // by person's name
    expect((await listAuditLog(orgA, { search: "ord_1" })).total).toBe(1); // by record id
    expect((await listAuditLog(orgA, { search: "recurring" })).total).toBe(1); // by action / record type
    expect((await listAuditLog(orgA, { search: "nothing like this" })).total).toBe(0);
  });

  it("offers the record types and people for the filters, from this kitchen only", async () => {
    const log = await listAuditLog(orgA);
    expect(log.recordTypes).toEqual(["Customer", "Expense", "Order", "RecurringExpense"]);
    expect(log.actors).toEqual([{ id: alice, name: "User a" }]);
  });

  it("pages the results and clamps a page number that is out of range", async () => {
    const first = await listAuditLog(orgB);
    expect(first.total).toBe(AUDIT_PAGE_SIZE + 6);
    expect(first.pages).toBe(2);
    expect(first.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect([first.from, first.to]).toEqual([1, AUDIT_PAGE_SIZE]);
    const second = await listAuditLog(orgB, { page: 2 });
    expect(second.entries).toHaveLength(6);
    expect(new Set([...first.entries, ...second.entries].map((e) => e.id)).size).toBe(AUDIT_PAGE_SIZE + 6); // no overlap
    expect((await listAuditLog(orgB, { page: 99 })).page).toBe(2);
    expect((await listAuditLog(orgB, { page: -3 })).page).toBe(1);
    expect((await listAuditLog(orgA, { search: "zzz" })).entries).toEqual([]);
  });
});

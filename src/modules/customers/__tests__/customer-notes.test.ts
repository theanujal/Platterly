import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "../customer";
import { addCustomerNote, deleteCustomerNote, listCustomerNotes, updateCustomerNote, CustomerNoteError } from "../customer-notes";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customerNote.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Notes Org", slug: `notes-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Meera Team", email: `n-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Note Customer", phone: "9876543210" }, actor.id);
  return { org, actor, customer };
}

describe("customer notes", () => {
  it("the notes typed on the create form becomes the first dated note, with its author", async () => {
    const { org, actor } = await setup();
    const withNotes = await createCustomer(org.id, { name: "Lead", phone: "9876500001", notes: "  Met at an expo.  " }, actor.id);
    const [first] = await listCustomerNotes(org.id, withNotes.id);
    expect(first).toMatchObject({ body: "Met at an expo.", authorName: "Meera Team", authorUserId: actor.id });
  });

  it("adds, lists newest first, edits and deletes, each written to the audit log", async () => {
    const { org, actor, customer } = await setup();
    const author = { userId: actor.id, name: actor.name };
    const one = await addCustomerNote(org.id, customer.id, "Prefers veg.", author);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await addCustomerNote(org.id, customer.id, "Allergic to peanuts.", author);
    expect((await listCustomerNotes(org.id, customer.id)).map((n) => n.body)).toEqual(["Allergic to peanuts.", "Prefers veg."]);

    await updateCustomerNote(org.id, one.id, "Prefers pure veg.", actor.id);
    expect((await prisma.customerNote.findUniqueOrThrow({ where: { id: one.id } })).body).toBe("Prefers pure veg.");
    await deleteCustomerNote(org.id, one.id, actor.id);
    expect(await listCustomerNotes(org.id, customer.id)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: { startsWith: "customer_note." } } })).toBe(4);
  });

  it("refuses an empty or oversized note", async () => {
    const { org, actor, customer } = await setup();
    await expect(addCustomerNote(org.id, customer.id, "   ", { userId: actor.id, name: "x" })).rejects.toBeInstanceOf(CustomerNoteError);
    await expect(addCustomerNote(org.id, customer.id, "x".repeat(2001), { userId: actor.id, name: "x" })).rejects.toBeInstanceOf(CustomerNoteError);
  });

  it("another kitchen can neither read, edit nor delete a note, nor add one to the customer", async () => {
    const a = await setup();
    const b = await setup();
    const note = await addCustomerNote(a.org.id, a.customer.id, "Private.", { userId: a.actor.id, name: "A" });
    expect(await listCustomerNotes(b.org.id, a.customer.id)).toHaveLength(0);
    await expect(updateCustomerNote(b.org.id, note.id, "Hacked", b.actor.id)).rejects.toThrow();
    await expect(deleteCustomerNote(b.org.id, note.id, b.actor.id)).rejects.toThrow();
    await expect(addCustomerNote(b.org.id, a.customer.id, "Sneaky", { userId: b.actor.id, name: "B" })).rejects.toThrow();
  });
});

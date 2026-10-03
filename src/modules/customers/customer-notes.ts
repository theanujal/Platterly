import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export class CustomerNoteError extends Error {}

const MAX_NOTE_LENGTH = 2000;

function clean(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new CustomerNoteError("Write something first.");
  if (trimmed.length > MAX_NOTE_LENGTH) throw new CustomerNoteError(`Keep a note under ${MAX_NOTE_LENGTH} characters.`);
  return trimmed;
}

/** A customer's dated notes, newest first, each with who wrote it. */
export async function listCustomerNotes(organizationId: string, customerId: string) {
  return prisma.customerNote.findMany({ where: { organizationId, customerId }, orderBy: { createdAt: "desc" } });
}

export async function addCustomerNote(organizationId: string, customerId: string, body: string, author: { userId?: string; name: string }) {
  await prisma.customer.findFirstOrThrow({ where: { id: customerId, organizationId }, select: { id: true } });
  const note = await prisma.customerNote.create({
    data: { organizationId, customerId, body: clean(body), authorUserId: author.userId, authorName: author.name },
  });
  await audit({ organizationId, actorUserId: author.userId, action: "customer_note.create", recordType: "CustomerNote", recordId: note.id, after: { customerId } });
  return note;
}

export async function updateCustomerNote(organizationId: string, noteId: string, body: string, actorUserId: string) {
  const before = await prisma.customerNote.findFirstOrThrow({ where: { id: noteId, organizationId } });
  const note = await prisma.customerNote.update({ where: { id: noteId }, data: { body: clean(body) } });
  await audit({ organizationId, actorUserId, action: "customer_note.update", recordType: "CustomerNote", recordId: noteId, before: { body: before.body }, after: { body: note.body } });
  return note;
}

export async function deleteCustomerNote(organizationId: string, noteId: string, actorUserId: string) {
  const before = await prisma.customerNote.findFirstOrThrow({ where: { id: noteId, organizationId } });
  await prisma.customerNote.delete({ where: { id: noteId } });
  await audit({ organizationId, actorUserId, action: "customer_note.delete", recordType: "CustomerNote", recordId: noteId, before: { body: before.body } });
}

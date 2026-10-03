import { matchesDeclaredType } from "@/lib/storage/file-signature";
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { getStorageDriver } from "@/lib/storage/storage";

export class AttachmentError extends Error {}

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_EXPENSE = 5;
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * A receipt or bill kept with an expense: a PNG, JPG, WebP or PDF up to 4MB, five per expense. Files go through the
 * storage driver (local in dev). Local files are served from a random, unguessable path; a real S3 / R2 driver
 * would hand out signed links instead.
 */
export async function addExpenseAttachment(organizationId: string, expenseId: string, file: File, actorUserId?: string) {
  await prisma.expense.findFirstOrThrow({ where: { id: expenseId, organizationId }, select: { id: true } });
  const extension = ALLOWED_ATTACHMENT_TYPES[file.type];
  if (!extension) throw new AttachmentError("A receipt must be a PNG, JPG, WebP or PDF file.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachmentError("A receipt must be 4MB or smaller.");
  if (file.size === 0) throw new AttachmentError("That file is empty.");
  const existing = await prisma.expenseAttachment.count({ where: { expenseId } });
  if (existing >= MAX_ATTACHMENTS_PER_EXPENSE) throw new AttachmentError(`An expense can have at most ${MAX_ATTACHMENTS_PER_EXPENSE} files.`);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesDeclaredType(bytes, file.type)) throw new AttachmentError("That file is not a real PNG, JPG, WebP or PDF.");

  const key = `organizations/${organizationId}/expenses/${expenseId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await getStorageDriver().upload(key, bytes, file.type);
  const attachment = await prisma.expenseAttachment.create({
    data: {
      organizationId,
      expenseId,
      key: uploaded.key,
      url: uploaded.url,
      fileName: (file.name || `receipt.${extension}`).trim().slice(0, 120),
      contentType: file.type,
      sizeBytes: file.size,
      uploadedByUserId: actorUserId,
    },
  });
  await audit({ organizationId, actorUserId, action: "expense.attachment.add", recordType: "Expense", recordId: expenseId, after: { fileName: attachment.fileName } });
  return attachment;
}

export async function removeExpenseAttachment(organizationId: string, attachmentId: string, actorUserId?: string) {
  const attachment = await prisma.expenseAttachment.findFirstOrThrow({ where: { id: attachmentId, organizationId } });
  await prisma.expenseAttachment.delete({ where: { id: attachmentId } });
  await getStorageDriver().delete(attachment.key);
  await audit({ organizationId, actorUserId, action: "expense.attachment.remove", recordType: "Expense", recordId: attachment.expenseId, before: { fileName: attachment.fileName } });
}

/** Removes the stored files of attachments whose rows are already gone (an expense was deleted). */
export async function deleteStoredFiles(keys: string[]) {
  await Promise.all(keys.map((key) => getStorageDriver().delete(key)));
}

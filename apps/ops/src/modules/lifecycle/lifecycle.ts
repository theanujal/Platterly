import "server-only";
import { newId, type ProviderChannel } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { DELETE_RETENTION_DAYS } from "@platterly/contract";
import { sendCommand, type OutboundInput } from "@/modules/commands/outbox";
import { tellOwner } from "@/modules/messages/messages";
import { prepareSnapshot } from "@/modules/snapshots/issue";
import { startTrial } from "@/modules/subscriptions/subscriptions";

/**
 * What an operator does to a business (docs/ops-contract.md sections 6 and 22): create it, change its identity, suspend and
 * reactivate it, delete (suspended and restorable) and restore it, switch a message channel. The product is the one that
 * changes; ops asks with a signed command and tells the operator what the product answered. A command the product could not
 * be reached for stays queued and is retried, and the screen says so instead of pretending it worked.
 */
export class LifecycleError extends Error {}

export type CommandResult = { ok: true; delivered: boolean } | { ok: false; error: string };

/** Sends one command now and reads back how it went: delivered, still waiting for a retry, or refused (with the product's reason). */
export async function runCommand(input: OutboundInput, fetchImpl?: typeof fetch): Promise<CommandResult> {
  const commandId = await sendCommand(input, fetchImpl);
  if (!commandId) return { ok: true, delivered: false };
  const row = await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId } });
  if (row.status === "SENT") return { ok: true, delivered: true };
  if (row.status === "PENDING") return { ok: true, delivered: false };
  const reason = (row.response as { error?: string } | null)?.error;
  return { ok: false, error: reason ? `The product refused: ${reason}` : (row.lastError ?? "The product could not apply this.") };
}

async function link(businessId: string, productKey: string) {
  const found = await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } }, include: { business: true } });
  if (!found) throw new LifecycleError("This business is not on that product.");
  return found;
}

const splitName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first: first ?? "", last: rest.join(" ") };
};

export interface NewBusinessInput {
  productKey: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
}

/**
 * Creates a business on a product: the record and a trial subscription here first, then `business.provision` with the first
 * snapshot in the same command, so the product never has a kitchen without one (section 6.1). If the product cannot be
 * reached the business exists here and the provision is retried by the scheduled job.
 */
export async function createBusiness(input: NewBusinessInput, staffId: string | null, fetchImpl?: typeof fetch): Promise<{ businessId: string; delivered: boolean }> {
  const name = input.name.trim();
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!name || !ownerName) throw new LifecycleError("The business name and the owner's name are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new LifecycleError("Enter a valid owner email.");
  const product = await prisma.product.findUnique({ where: { key: input.productKey } });
  if (!product || product.status !== "ACTIVE") throw new LifecycleError("Choose an active product.");
  if (!(await prisma.plan.findFirst({ where: { productKey: input.productKey, isTrial: true, isActive: true } }))) throw new LifecycleError("This product has no active trial plan yet. Create one under Plans first.");

  const businessId = newId("business");
  await prisma.business.create({ data: { id: businessId, name, ownerName, ownerEmail, products: { create: { productKey: input.productKey } } } });
  await startTrial(businessId, input.productKey, new Date(), false);
  const snapshot = await prepareSnapshot(businessId, input.productKey);
  if (!snapshot) throw new LifecycleError("Could not start the trial.");
  await audit({ actorUserId: staffId, action: "business.created", subject: businessId, detail: { productKey: input.productKey, name } });
  const result = await runCommand({ productKey: input.productKey, dedupeKey: `provision:${businessId}:${input.productKey}`, command: { type: "business.provision", businessId, payload: { businessName: name, ownerEmail, ownerName, snapshot } } }, fetchImpl);
  if (!result.ok) throw new LifecycleError(result.error);
  await tellOwner({ businessId, productKey: input.productKey, template: "welcome_owner", dedupeKey: `welcome:${businessId}` });
  return { businessId, delivered: result.delivered };
}

export interface IdentityChanges {
  name?: string;
  ownerName?: string;
  ownerEmail?: string;
  contactPhone?: string;
  slug?: string;
}

/** Asks the product to change the business's identity. Ops's own copy follows when the product reports it (`business.updated`). */
export async function updateBusiness(businessId: string, productKey: string, changes: IdentityChanges, staffId: string | null, fetchImpl?: typeof fetch): Promise<CommandResult> {
  await link(businessId, productKey);
  const payload: Record<string, string> = {};
  const text = (value: string | undefined) => value?.trim() || undefined;
  if (text(changes.name)) payload.businessName = text(changes.name)!;
  if (text(changes.ownerName)) {
    const { first, last } = splitName(changes.ownerName!);
    payload.ownerFirstName = first;
    if (last) payload.ownerLastName = last;
  }
  if (text(changes.ownerEmail)) payload.ownerEmail = text(changes.ownerEmail)!.toLowerCase();
  if (text(changes.contactPhone)) payload.contactPhone = text(changes.contactPhone)!;
  if (text(changes.slug)) payload.slug = text(changes.slug)!;
  if (Object.keys(payload).length === 0) throw new LifecycleError("Change at least one field.");
  const result = await runCommand({ productKey, command: { type: "business.update", businessId, payload } }, fetchImpl);
  if (result.ok) {
    // The email and name are ops's billing contact too; the product's own `business.updated` event does not carry the email.
    if (payload.ownerEmail) await prisma.business.update({ where: { id: businessId }, data: { ownerEmail: payload.ownerEmail } });
    await audit({ actorUserId: staffId, action: "business.updated", subject: businessId, detail: { productKey, fields: Object.keys(payload) } });
  }
  return result;
}

export async function suspendBusiness(businessId: string, productKey: string, reason: string, staffId: string | null, fetchImpl?: typeof fetch): Promise<CommandResult> {
  await link(businessId, productKey);
  if (!reason.trim()) throw new LifecycleError("Give a reason for the suspension.");
  const result = await runCommand({ productKey, command: { type: "business.suspend", businessId, payload: { reason: reason.trim() } } }, fetchImpl);
  if (result.ok && result.delivered) await prisma.business.update({ where: { id: businessId }, data: { status: "SUSPENDED" } });
  if (result.ok) await audit({ actorUserId: staffId, action: "business.suspended", subject: businessId, detail: { productKey, reason: reason.trim() } });
  return result;
}

export async function reactivateBusiness(businessId: string, productKey: string, staffId: string | null, fetchImpl?: typeof fetch): Promise<CommandResult> {
  await link(businessId, productKey);
  const result = await runCommand({ productKey, command: { type: "business.reactivate", businessId, payload: {} } }, fetchImpl);
  if (result.ok && result.delivered) await prisma.business.update({ where: { id: businessId }, data: { status: "ACTIVE", deleteAfter: null } });
  if (result.ok) await audit({ actorUserId: staffId, action: "business.reactivated", subject: businessId, detail: { productKey } });
  return result;
}

/**
 * Delete as the contract defines it: the business name must be typed, the product suspends it, and it stays restorable for
 * the retention period (30 days). Nothing is removed by this call, and nothing is removed automatically afterwards either:
 * the final removal of a business's data is not built (section 22).
 */
export async function deleteBusiness(businessId: string, productKey: string, confirmation: string, staffId: string | null, now: Date = new Date(), fetchImpl?: typeof fetch): Promise<CommandResult> {
  const found = await link(businessId, productKey);
  if (confirmation.trim() !== found.business.name.trim()) throw new LifecycleError("Type the business name exactly to confirm.");
  const result = await runCommand({ productKey, command: { type: "business.delete", businessId, payload: { confirmation: confirmation.trim(), retentionDays: DELETE_RETENTION_DAYS } } }, fetchImpl);
  if (result.ok && result.delivered) await prisma.business.update({ where: { id: businessId }, data: { status: "PENDING_DELETE", deleteAfter: new Date(now.getTime() + DELETE_RETENTION_DAYS * 86_400_000) } });
  if (result.ok) await audit({ actorUserId: staffId, action: "business.delete_requested", subject: businessId, detail: { productKey, retentionDays: DELETE_RETENTION_DAYS } });
  return result;
}

export async function restoreBusiness(businessId: string, productKey: string, staffId: string | null, fetchImpl?: typeof fetch): Promise<CommandResult> {
  await link(businessId, productKey);
  const result = await runCommand({ productKey, command: { type: "business.restore", businessId, payload: {} } }, fetchImpl);
  if (result.ok && result.delivered) await prisma.business.update({ where: { id: businessId }, data: { status: "ACTIVE", deleteAfter: null } });
  if (result.ok) await audit({ actorUserId: staffId, action: "business.restored", subject: businessId, detail: { productKey } });
  return result;
}

export async function setProvider(businessId: string, productKey: string, channel: ProviderChannel, connected: boolean, staffId: string | null, fetchImpl?: typeof fetch): Promise<CommandResult> {
  await link(businessId, productKey);
  const result = await runCommand({ productKey, command: { type: "provider.set", businessId, payload: { channel, connected } } }, fetchImpl);
  if (result.ok) await audit({ actorUserId: staffId, action: `business.${channel}_${connected ? "connected" : "disconnected"}`, subject: businessId, detail: { productKey } });
  return result;
}

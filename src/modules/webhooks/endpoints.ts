import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ValidationError } from "@/lib/errors";
import { checkText } from "@/lib/validation";
import { encryptSecret } from "@/modules/payments/secret-box";
import { cleanEvents } from "./events";
import { assertWebhookUrl, UnsafeWebhookUrlError } from "./url-guard";

/**
 * Chunk 25 — a kitchen's webhook endpoints. The signing secret is shown once at creation (and after a rotation); it is
 * stored encrypted, so Platterly can sign with it later but nobody can read it back, and the list shows only a hint.
 */
export const MAX_WEBHOOK_ENDPOINTS = 5;

export interface WebhookEndpointView {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  createdAt: Date;
}

const view = (e: { id: string; url: string; description: string | null; events: string[]; isActive: boolean; disabledReason: string | null; consecutiveFailures: number; createdAt: Date }): WebhookEndpointView => ({
  id: e.id,
  url: e.url,
  description: e.description,
  events: e.events,
  isActive: e.isActive,
  disabledReason: e.disabledReason,
  consecutiveFailures: e.consecutiveFailures,
  createdAt: e.createdAt,
});

const newSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

function checkUrl(raw: string): string {
  try {
    return assertWebhookUrl(raw).toString();
  } catch (error) {
    if (error instanceof UnsafeWebhookUrlError) throw new ValidationError(error.message);
    throw error;
  }
}

export async function listWebhookEndpoints(organizationId: string): Promise<WebhookEndpointView[]> {
  return (await prisma.webhookEndpoint.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } })).map(view);
}

export async function createWebhookEndpoint(organizationId: string, input: { url: string; description?: string; events: unknown }, actorUserId: string): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
  const url = checkUrl(input.url);
  checkText(input.description, "description", 200);
  const events = cleanEvents(input.events);
  if (events.length === 0) throw new ValidationError("Choose at least one event to send.");
  if ((await prisma.webhookEndpoint.count({ where: { organizationId } })) >= MAX_WEBHOOK_ENDPOINTS) throw new ValidationError(`A kitchen can have ${MAX_WEBHOOK_ENDPOINTS} webhook endpoints.`);
  const secret = newSecret();
  const row = await prisma.webhookEndpoint.create({ data: { organizationId, url, description: input.description?.trim() || null, events, secretEnc: encryptSecret(secret) } });
  await audit({ organizationId, actorUserId, action: "webhook_endpoint.create", recordType: "WebhookEndpoint", recordId: row.id, after: { url, events } });
  return { endpoint: view(row), secret };
}

export async function updateWebhookEndpoint(organizationId: string, id: string, input: { url?: string; description?: string | null; events?: unknown; isActive?: boolean }, actorUserId: string): Promise<WebhookEndpointView> {
  const before = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId } });
  if (!before) throw new ValidationError("That webhook doesn't exist.");
  const data: Record<string, unknown> = {};
  if (input.url !== undefined) data.url = checkUrl(input.url);
  if (input.description !== undefined) {
    checkText(input.description, "description", 200);
    data.description = input.description?.trim() || null;
  }
  if (input.events !== undefined) {
    const events = cleanEvents(input.events);
    if (events.length === 0) throw new ValidationError("Choose at least one event to send.");
    data.events = events;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
    // Turning it back on starts fresh: the earlier failures no longer count against it.
    if (input.isActive) Object.assign(data, { disabledReason: null, consecutiveFailures: 0 });
  }
  const row = await prisma.webhookEndpoint.update({ where: { id }, data });
  await audit({ organizationId, actorUserId, action: "webhook_endpoint.update", recordType: "WebhookEndpoint", recordId: id, before: { url: before.url, events: before.events, isActive: before.isActive }, after: { url: row.url, events: row.events, isActive: row.isActive } });
  return view(row);
}

/** A new secret; the old one stops signing at once. Returned once. */
export async function rotateWebhookSecret(organizationId: string, id: string, actorUserId: string): Promise<{ secret: string }> {
  const secret = newSecret();
  const claimed = await prisma.webhookEndpoint.updateMany({ where: { id, organizationId }, data: { secretEnc: encryptSecret(secret) } });
  if (claimed.count === 0) throw new ValidationError("That webhook doesn't exist.");
  await audit({ organizationId, actorUserId, action: "webhook_endpoint.rotate_secret", recordType: "WebhookEndpoint", recordId: id });
  return { secret };
}

export async function deleteWebhookEndpoint(organizationId: string, id: string, actorUserId: string): Promise<void> {
  const before = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId } });
  if (!before) throw new ValidationError("That webhook doesn't exist.");
  await prisma.webhookEndpoint.delete({ where: { id } });
  await audit({ organizationId, actorUserId, action: "webhook_endpoint.delete", recordType: "WebhookEndpoint", recordId: id, before: { url: before.url } });
}

export interface DeliveryView {
  id: string;
  endpointId: string;
  eventId: string;
  eventName: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

/** The latest deliveries for the log (the payload is not shown: it can hold customer names). */
export async function listDeliveries(organizationId: string, options: { endpointId?: string; take?: number } = {}): Promise<DeliveryView[]> {
  const rows = await prisma.webhookDelivery.findMany({
    where: { organizationId, ...(options.endpointId ? { endpointId: options.endpointId } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.take ?? 50, 200),
    select: { id: true, endpointId: true, eventId: true, eventName: true, status: true, attempts: true, lastStatusCode: true, lastError: true, nextAttemptAt: true, createdAt: true, deliveredAt: true },
  });
  return rows;
}

/** Puts a failed delivery back in the queue for another try now (the owner's "Retry" button). */
export async function retryDelivery(organizationId: string, deliveryId: string): Promise<void> {
  const claimed = await prisma.webhookDelivery.updateMany({ where: { id: deliveryId, organizationId, status: "FAILED" }, data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null } });
  if (claimed.count === 0) throw new ValidationError("Only a failed delivery can be retried.");
}

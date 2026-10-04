"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { userMessage } from "@/lib/errors";
import { createApiKey, revokeApiKey } from "@/modules/api/keys";
import { createWebhookEndpoint, deleteWebhookEndpoint, retryDelivery, rotateWebhookSecret, updateWebhookEndpoint } from "@/modules/webhooks/endpoints";
import { attemptDelivery, newEventId } from "@/modules/webhooks/deliver";
import { enqueue } from "@/modules/webhooks/emit";
import { prisma } from "@/lib/db";

/**
 * Chunk 25 — API keys and webhooks. Owner only (`settings:edit`); the kitchen always comes from the session, never from
 * an argument. A key or a signing secret is returned exactly once, in the result of the call that made it.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard() {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);
  return { organizationId, userId: session.user.id };
}

async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    revalidatePath("/settings/integration/api-webhooks");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: userMessage(error, "Something went wrong.") };
  }
}

export async function createApiKeyAction(name: string, scopes: string[]): Promise<ActionResult<{ key: string }>> {
  const { organizationId, userId } = await guard();
  return run(async () => ({ key: (await createApiKey(organizationId, { name, scopes }, userId)).key }));
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  const { organizationId, userId } = await guard();
  return run(async () => {
    await revokeApiKey(organizationId, id, userId);
    return {};
  });
}

export async function createWebhookAction(url: string, description: string, events: string[]): Promise<ActionResult<{ secret: string }>> {
  const { organizationId, userId } = await guard();
  return run(async () => ({ secret: (await createWebhookEndpoint(organizationId, { url, description, events }, userId)).secret }));
}

export async function updateWebhookAction(id: string, patch: { isActive?: boolean; events?: string[] }): Promise<ActionResult> {
  const { organizationId, userId } = await guard();
  return run(async () => {
    await updateWebhookEndpoint(organizationId, id, patch, userId);
    return {};
  });
}

export async function rotateWebhookSecretAction(id: string): Promise<ActionResult<{ secret: string }>> {
  const { organizationId, userId } = await guard();
  return run(() => rotateWebhookSecret(organizationId, id, userId));
}

export async function deleteWebhookAction(id: string): Promise<ActionResult> {
  const { organizationId, userId } = await guard();
  return run(async () => {
    await deleteWebhookEndpoint(organizationId, id, userId);
    return {};
  });
}

/** Sends a `webhook.test` event to one endpoint now and says how it went. */
export async function testWebhookAction(id: string): Promise<ActionResult<{ message: string }>> {
  const { organizationId } = await guard();
  return run(async () => {
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!endpoint) throw new Error("That webhook doesn't exist.");
    const [deliveryId] = await enqueue(organizationId, "webhook.test", [endpoint.id], { message: "This is a test event from Platterly.", event_id: newEventId() });
    await attemptDelivery(deliveryId);
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, select: { status: true, lastStatusCode: true, lastError: true } });
    return { message: row.status === "DELIVERED" ? `The receiver answered ${row.lastStatusCode}.` : `Not delivered: ${row.lastError ?? "no answer"}` };
  });
}

export async function retryDeliveryAction(id: string): Promise<ActionResult> {
  const { organizationId } = await guard();
  return run(async () => {
    await retryDelivery(organizationId, id);
    await attemptDelivery(id);
    return {};
  });
}

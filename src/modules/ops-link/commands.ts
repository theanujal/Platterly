import "server-only";
import { type Command } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { saveOpsNotice } from "@/modules/subscriptions/platform-notice";
import { audit } from "@/lib/audit/audit";
import { canonicalUrl } from "@/lib/seo/canonical";
import { setChannelProviderConnected } from "@/modules/notifications/channel-settings";
import { onProviderDisconnected } from "@/modules/notifications/triggers";
import { generatePlaceholderSlug } from "@/modules/tenants/slug";
import { InvalidSlugError, SlugTakenError, activateTenant, overrideSlug, suspendTenant, updateTenant } from "@/modules/tenants/tenant";
import { CATERING_ENTITLEMENTS } from "./manifest";
import { storeSnapshot } from "./snapshots";
import { parseCommand } from "@platterly/contract";

export interface CommandReply {
  status: number;
  body: Record<string, unknown>;
}

const split = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first: first ?? "", last: rest.join(" ") };
};

/**
 * `business.provision`: creates the kitchen's record under the business id ops minted, with the first snapshot. Like the old
 * Super Admin "create caterer" it creates the Organization only; the owner signs in through the normal sign-up. A repeat
 * (same business id) answers the existing kitchen, so ops can retry freely.
 */
async function provision(command: Extract<Command, { type: "business.provision" }>): Promise<CommandReply> {
  const { businessName, ownerEmail, ownerName, snapshot } = command.payload;
  const existing = await prisma.organization.findUnique({ where: { businessId: command.businessId }, select: { id: true } });
  if (existing) return { status: 200, body: { ok: true, organizationId: existing.id, existing: true, signInUrl: canonicalUrl("/") } };
  const { first, last } = split(ownerName);
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), businessId: command.businessId, createdAt: new Date(), name: businessName, slug: await generatePlaceholderSlug(), ownerFirstName: first, ownerLastName: last, contactEmail: ownerEmail },
  });
  await audit({ organizationId: org.id, recordType: "Organization", recordId: org.id, action: "tenant.provisioned_by_ops", after: { name: org.name } });
  await storeSnapshot(org.id, snapshot);
  return { status: 200, body: { ok: true, organizationId: org.id, existing: false, signInUrl: canonicalUrl("/") } };
}

async function execute(command: Command): Promise<CommandReply> {
  if (command.type === "business.provision") return provision(command);
  const org = await prisma.organization.findUnique({ where: { businessId: command.businessId }, select: { id: true, name: true, status: true, ownerFirstName: true, ownerLastName: true } });
  if (!org) return { status: 404, body: { ok: false, error: "unknown_business" } };

  switch (command.type) {
    case "snapshot.push": {
      const stored = await storeSnapshot(org.id, command.payload.snapshot);
      return { status: 200, body: { ok: true, ...stored } };
    }
    case "notice.set": {
      const { enabled, title, message, buttonLabel, buttonUrl } = command.payload;
      try {
        await saveOpsNotice(org.id, command.businessId, { enabled, title: title ?? "", message: message ?? "", buttonLabel: buttonLabel ?? "", buttonUrl: buttonUrl ?? "" });
      } catch (error) {
        // Over this product's limits or a bad link: ops should fix the notice, so retrying the same command cannot help.
        if (error instanceof ValidationError) return { status: 400, body: { ok: false, error: error.message } };
        throw error;
      }
      return { status: 200, body: { ok: true } };
    }
    case "business.update": {
      const { businessName, ownerFirstName, ownerLastName, ownerEmail, contactPhone, slug } = command.payload;
      try {
        if (businessName || ownerFirstName || ownerLastName || ownerEmail || contactPhone) {
          await updateTenant(org.id, { name: businessName ?? org.name, ownerFirstName, ownerLastName, contactEmail: ownerEmail, contactPhone });
        }
        if (slug) await overrideSlug(org.id, slug);
      } catch (error) {
        if (error instanceof SlugTakenError) return { status: 409, body: { ok: false, error: error.message } };
        if (error instanceof InvalidSlugError) return { status: 400, body: { ok: false, error: error.message } };
        throw error;
      }
      return { status: 200, body: { ok: true } };
    }
    case "provider.set": {
      const { channel, connected } = command.payload;
      await setChannelProviderConnected(org.id, channel, connected);
      if (!connected) await onProviderDisconnected(org.id, channel === "email" ? "Email" : "WhatsApp");
      await audit({ organizationId: org.id, action: `notifications.${channel}_provider_${connected ? "connected" : "disconnected"}`, recordType: "Organization", recordId: org.id });
      return { status: 200, body: { ok: true } };
    }
    case "business.delete": {
      // The typed confirmation is the business's name. Deleting here means "suspended and restorable": the product never
      // removes data by itself (docs/ops-contract.md section 22), so the retention period is ops's to keep and act on.
      if (command.payload.confirmation.trim() !== org.name.trim()) return { status: 400, body: { ok: false, error: "confirmation_mismatch" } };
      if (org.status === "DEACTIVATED") return { status: 409, body: { ok: false, error: "deactivated" } };
      if (org.status !== "SUSPENDED") await suspendTenant(org.id);
      await audit({ organizationId: org.id, action: "tenant.delete_requested", recordType: "Organization", recordId: org.id, after: { retentionDays: command.payload.retentionDays } });
      return { status: 200, body: { ok: true, status: "SUSPENDED", dataRemoved: false } };
    }
    case "business.restore": {
      if (org.status === "DEACTIVATED") return { status: 409, body: { ok: false, error: "deactivated" } };
      if (org.status !== "ACTIVE") await activateTenant(org.id);
      await audit({ organizationId: org.id, action: "tenant.delete_restored", recordType: "Organization", recordId: org.id });
      return { status: 200, body: { ok: true, status: "ACTIVE" } };
    }
    case "business.suspend":
      if (org.status === "DEACTIVATED") return { status: 409, body: { ok: false, error: "deactivated" } };
      if (org.status !== "SUSPENDED") await suspendTenant(org.id);
      return { status: 200, body: { ok: true, status: "SUSPENDED" } };
    case "business.reactivate":
      // Only a suspension can be lifted here; a deactivated business stays deactivated until its own screen says otherwise.
      if (org.status === "DEACTIVATED") return { status: 409, body: { ok: false, error: "deactivated" } };
      if (org.status !== "ACTIVE") await activateTenant(org.id);
      return { status: 200, body: { ok: true, status: "ACTIVE" } };
  }
}

/**
 * Applies one signed command. A command id seen before returns the stored answer without running again, so ops can
 * retry freely. Only settled answers (200, 404, 409, 501) are remembered; an error is retried by ops.
 */
export async function handleCommand(rawBody: string): Promise<CommandReply> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: "body is not JSON" } };
  }
  const parsed = parseCommand(json, CATERING_ENTITLEMENTS);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } };
  const command = parsed.value;

  const seen = await prisma.opsCommand.findUnique({ where: { commandId: command.commandId } });
  if (seen) return seen.result as unknown as CommandReply;

  const reply = await execute(command);
  try {
    await prisma.opsCommand.create({ data: { commandId: command.commandId, type: command.type, businessId: command.businessId, result: reply as unknown as Prisma.InputJsonValue } });
  } catch (error) {
    // Two copies of the same command arrived together: the first one's answer stands.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const first = await prisma.opsCommand.findUnique({ where: { commandId: command.commandId } });
      if (first) return first.result as unknown as CommandReply;
    }
    throw error;
  }
  return reply;
}

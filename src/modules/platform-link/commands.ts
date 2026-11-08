import "server-only";
import { parseOrganisationLinkCommand } from "@platterly/platform-contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { generatePlaceholderSlug } from "@/modules/tenants/slug";

export interface PlatformReply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * `organisation.link`: adopt the Platform's business id. If a kitchen already carries that id nothing changes (created: false); otherwise the kitchen
 * record is created under it, as `business.provision` does today. It creates no users: the owner joins through the normal sign-in. A repeat of the same
 * command id is answered from the stored result and runs once.
 */
async function link(command: ReturnType<typeof parseOrganisationLinkCommand> & { ok: true }): Promise<PlatformReply> {
  const { businessId, businessName } = command.value;
  const existing = await prisma.organization.findUnique({ where: { businessId }, select: { id: true } });
  if (existing) return { status: 200, body: { businessId, created: false } };
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), businessId, createdAt: new Date(), name: businessName, slug: await generatePlaceholderSlug() } });
  await audit({ organizationId: org.id, recordType: "Organization", recordId: org.id, action: "tenant.linked_by_platform", after: { name: org.name } });
  return { status: 200, body: { businessId, created: true } };
}

export async function handlePlatformCommand(rawBody: string): Promise<PlatformReply> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "bad_json" } };
  }
  const parsed = parseOrganisationLinkCommand(json);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { commandId, type, businessId } = parsed.value;

  const seen = await prisma.platformCommand.findUnique({ where: { commandId } });
  if (seen) return { status: 200, body: seen.result as Record<string, unknown> };
  const reply = await link(parsed);
  try {
    await prisma.platformCommand.create({ data: { commandId, type, businessId, result: reply.body as Prisma.InputJsonValue } });
  } catch (error) {
    // Two copies of one command arrived together: the other one stored first. Answer what it stored.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const first = await prisma.platformCommand.findUnique({ where: { commandId } });
      if (first) return { status: 200, body: first.result as Record<string, unknown> };
    }
    throw error;
  }
  return reply;
}

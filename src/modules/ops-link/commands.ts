import "server-only";
import { type Command } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { activateTenant, suspendTenant } from "@/modules/tenants/tenant";
import { CATERING_ENTITLEMENTS } from "./manifest";
import { storeSnapshot } from "./snapshots";
import { parseCommand } from "@platterly/contract";

export interface CommandReply {
  status: number;
  body: Record<string, unknown>;
}

const NOT_YET: Command["type"][] = ["business.provision", "notice.set", "business.delete", "business.restore"];

async function execute(command: Command): Promise<CommandReply> {
  if (NOT_YET.includes(command.type)) {
    // Built in later steps (docs/ops-contract.md section 12): provisioning and the notice move with billing, deletion needs its own review.
    return { status: 501, body: { ok: false, error: "not_supported_yet", type: command.type } };
  }
  const org = await prisma.organization.findUnique({ where: { businessId: command.businessId }, select: { id: true, status: true } });
  if (!org) return { status: 404, body: { ok: false, error: "unknown_business" } };

  switch (command.type) {
    case "snapshot.push": {
      const stored = await storeSnapshot(org.id, command.payload.snapshot);
      return { status: 200, body: { ok: true, ...stored } };
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
    default:
      return { status: 501, body: { ok: false, error: "not_supported_yet" } };
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

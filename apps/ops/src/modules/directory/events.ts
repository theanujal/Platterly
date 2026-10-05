import "server-only";
import { CONTRACT_VERSION, HEADERS, parseEvent, verifyRequest, type ProductEvent } from "@platterly/contract";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { secretsOf } from "@/modules/registry/products";
import { sendMessage } from "@/modules/messages/messages";
import { startTrial } from "@/modules/subscriptions/subscriptions";

export interface EventReply {
  status: number;
  body: Record<string, unknown>;
}

const UNAUTHORIZED: EventReply = { status: 401, body: { error: "unauthorized" } };

type Tx = Prisma.TransactionClient;
type Outcome = { applied: true; startTrial?: boolean; sendMessage?: boolean } | { applied: false; reason: string };

async function ownsBusiness(tx: Tx, productKey: string, businessId: string): Promise<boolean> {
  return (await tx.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } } })) !== null;
}

/** Applies one verified event. A product can only touch businesses it has itself registered. */
async function apply(tx: Tx, event: ProductEvent): Promise<Outcome> {
  const { productKey, businessId } = event;

  if (event.type === "business.signed_up") {
    const isNew = (await tx.business.findUnique({ where: { id: businessId }, select: { id: true } })) === null;
    await tx.business.upsert({
      where: { id: businessId },
      create: { id: businessId, name: event.data.businessName, ownerName: event.data.ownerName, ownerEmail: event.data.ownerEmail },
      update: {},
    });
    await tx.businessProduct.upsert({ where: { businessId_productKey: { businessId, productKey } }, create: { businessId, productKey, lastActiveAt: new Date(event.occurredAt) }, update: {} });
    // Only a genuinely new business raises an alert: not a repeat, not a second product joining, not a backfill of businesses that existed before the link.
    const brandNew = isNew && !event.data.backfill;
    if (brandNew) await tx.alert.create({ data: { productKey, businessId, severity: "INFO", code: "business.signed_up", message: `${event.data.businessName} signed up (${event.data.ownerEmail}).` } });
    return { applied: true, startTrial: brandNew };
  }

  if (!(await ownsBusiness(tx, productKey, businessId))) return { applied: false, reason: "unknown business for this product" };

  switch (event.type) {
    case "business.updated":
      await tx.business.update({ where: { id: businessId }, data: { ...(event.data.businessName !== undefined ? { name: event.data.businessName } : {}), ...(event.data.ownerName !== undefined ? { ownerName: event.data.ownerName } : {}) } });
      return { applied: true };
    case "usage.reported":
      await tx.businessProduct.update({
        where: { businessId_productKey: { businessId, productKey } },
        data: { usage: { periodStart: event.data.periodStart, counts: event.data.counts }, usageReportedAt: new Date(event.occurredAt), lastActiveAt: new Date(event.occurredAt) },
      });
      return { applied: true };
    case "owner.changed":
      await tx.business.update({ where: { id: businessId }, data: { ownerEmail: event.data.ownerEmail } });
      return { applied: true };
    case "alert.raised":
      await tx.alert.create({
        data: { productKey, businessId, severity: event.data.severity.toUpperCase() as "INFO" | "WARNING" | "CRITICAL", code: event.data.code, message: event.data.message },
      });
      return { applied: true };
    case "message.requested":
      // Sent after the event is safely recorded (see receiveEvent): a slow or failing mail provider never fails the event.
      return { applied: true, sendMessage: true };
  }
}

/**
 * POST /api/products/events. Order matters: find the product, verify the signature, then validate and apply.
 * Nothing in the body is trusted before the signature checks out; an unknown product and a bad signature look the same.
 */
export async function receiveEvent(rawBody: string, headers: Headers): Promise<EventReply> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "body is not JSON" } };
  }
  const productKey = typeof json === "object" && json !== null ? (json as { productKey?: unknown }).productKey : undefined;
  if (typeof productKey !== "string") return UNAUTHORIZED;

  const product = await prisma.product.findUnique({ where: { key: productKey } });
  if (!product || product.status !== "ACTIVE") return UNAUTHORIZED;

  const verified = verifyRequest(secretsOf(product).accept, headers, rawBody);
  if (!verified.ok) return UNAUTHORIZED;
  if (verified.contract > CONTRACT_VERSION) return { status: 400, body: { error: `contract ${verified.contract} is not supported` } };

  const parsed = parseEvent(json);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const event = parsed.value;
  if (event.eventId !== verified.id) return { status: 400, body: { error: `${HEADERS.id} does not match eventId` } };

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.inboundEvent.create({ data: { eventId: event.eventId, productKey, businessId: event.businessId, type: event.type, payload: json as Prisma.InputJsonValue, occurredAt: new Date(event.occurredAt) } });
      const outcome = await apply(tx, event);
      await tx.inboundEvent.update({ where: { eventId: event.eventId }, data: outcome.applied ? { processedAt: new Date() } : { error: outcome.reason } });
      return { reply: outcome.applied ? { status: 200, body: { ok: true } } : { status: 202, body: { ok: true, applied: false, reason: outcome.reason } }, trial: outcome.applied && outcome.startTrial === true, message: outcome.applied && outcome.sendMessage === true };
    });
    // A new business starts on the product's trial plan. After the event is safely recorded, and never able to fail it.
    if (result.trial) {
      try {
        await startTrial(event.businessId, event.productKey);
      } catch (error) {
        console.error("[ops events] could not start a trial for", event.businessId, error);
      }
    }
    if (result.message && event.type === "message.requested") {
      const sent = await sendMessage({ businessId: event.businessId, productKey: event.productKey, template: event.data.template, variables: event.data.variables, dedupeKey: `event:${event.eventId}` });
      // An unknown template or a missing variable is the product's mistake: say so (202), and keep the reason on the event.
      if (!sent.ok) {
        await prisma.inboundEvent.update({ where: { eventId: event.eventId }, data: { error: sent.error } });
        return { status: 202, body: { ok: true, applied: false, reason: sent.error } };
      }
    }
    return result.reply;
  } catch (error) {
    // The same event id arriving again (a retry) is accepted and ignored.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { status: 200, body: { ok: true, duplicate: true } };
    throw error;
  }
}

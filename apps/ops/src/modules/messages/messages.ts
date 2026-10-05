import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "./zeptomail";
import { hasTemplate, renderTemplate, type Variables } from "./templates";

/**
 * Messages from Platterly to a business owner (docs/ops-contract.md 9). Written to `message_log` first, then sent, so a send
 * that fails is retried from the stored template and variables:
 *   sent -> done          not configured / no owner email -> skipped (kept in the log, never retried)
 *   provider error or network error -> retry at 1m, 5m, 30m, 2h, 12h, then failed
 * A claim pushes the next attempt forward before sending, so two workers never send one message together.
 */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const CLAIM_LOCK_MS = 2 * 60_000;

export type SendOutcome = "sent" | "skipped" | "retry" | "failed" | "busy";

export interface MessageInput {
  businessId: string;
  productKey: string;
  template: string;
  variables?: Variables;
  /** The same fact again (a retried event, a daily sweep) sends once. */
  dedupeKey?: string;
}

/** Writes the log row and makes the first attempt. Refuses an unknown template or missing variable before anything is stored. */
export async function sendMessage(input: MessageInput, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; id: string | null; outcome: SendOutcome | "duplicate" } | { ok: false; error: string }> {
  if (!hasTemplate(input.template)) return { ok: false, error: `unknown template "${input.template}"` };
  const check = renderTemplate(input.template, input.variables ?? {}, { businessName: "", ownerName: "", productName: "", productUrl: "" });
  if (!check.ok) return { ok: false, error: check.error };

  let id: string;
  try {
    const row = await prisma.messageLog.create({
      data: { businessId: input.businessId, productKey: input.productKey, template: input.template, variables: (input.variables ?? {}) as Prisma.InputJsonValue, dedupeKey: input.dedupeKey ?? null },
      select: { id: true },
    });
    id = row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: true, id: null, outcome: "duplicate" };
    throw error;
  }
  return { ok: true, id, outcome: await attemptMessage(id, new Date(), fetchImpl) };
}

export async function attemptMessage(id: string, now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<SendOutcome> {
  const claimed = await prisma.messageLog.updateMany({
    where: { id, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "busy";
  const row = await prisma.messageLog.findUniqueOrThrow({ where: { id } });

  const [business, product] = await Promise.all([prisma.business.findUnique({ where: { id: row.businessId } }), row.productKey ? prisma.product.findUnique({ where: { key: row.productKey } }) : null]);
  const finish = async (data: Prisma.MessageLogUpdateInput, outcome: SendOutcome): Promise<SendOutcome> => {
    await prisma.messageLog.update({ where: { id }, data });
    return outcome;
  };
  if (!business?.ownerEmail) return finish({ status: "SKIPPED", error: "The business has no owner email.", nextAttemptAt: null }, "skipped");

  const rendered = renderTemplate(row.template, row.variables as Variables, {
    businessName: business.name,
    ownerName: business.ownerName ?? "",
    productName: product?.name ?? "Platterly",
    productUrl: product?.baseUrl ?? "https://platterly.in",
  });
  if (!rendered.ok) return finish({ status: "FAILED", error: rendered.error, nextAttemptAt: null }, "failed");

  const result = await sendEmail({ to: business.ownerEmail, subject: rendered.value.subject, html: rendered.value.html }, fetchImpl);
  const base = { toEmail: business.ownerEmail, subject: rendered.value.subject };
  if (result.status === "sent") return finish({ ...base, status: "SENT", sentAt: new Date(), providerMessage: result.providerMessageId, error: null, nextAttemptAt: null }, "sent");
  if (result.status === "skipped") return finish({ ...base, status: "SKIPPED", error: result.reason, nextAttemptAt: null }, "skipped");
  if (row.attempts < MAX_ATTEMPTS) return finish({ ...base, error: result.reason, nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_SECONDS[row.attempts - 1] * 1000) }, "retry");
  return finish({ ...base, status: "FAILED", error: result.reason, nextAttemptAt: null }, "failed");
}

/** The scheduled part: sends what is due (first attempts that were interrupted, and retries). Returns how many went out. */
export async function runDueMessages(now: Date = new Date(), limit = 50): Promise<number> {
  const due = await prisma.messageLog.findMany({ where: { status: "PENDING", OR: [{ nextAttemptAt: null, createdAt: { lte: new Date(now.getTime() - CLAIM_LOCK_MS) } }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  let sent = 0;
  for (const { id } of due) if ((await attemptMessage(id, now)) === "sent") sent += 1;
  return sent;
}

/**
 * Ops's own messages (receipts, failed payments, trial notices). A problem sending one is logged and never reaches the code
 * that moved the money or locked the trial: those facts are already true.
 */
export async function tellOwner(input: MessageInput): Promise<void> {
  try {
    const result = await sendMessage(input);
    if (!result.ok) console.error("[ops messages] not sent:", input.template, result.error);
  } catch (error) {
    console.error("[ops messages] could not send", input.template, error);
  }
}

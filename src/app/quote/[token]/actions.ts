"use server";

import { userMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { publicActionLimited } from "@/lib/public-rate-limit";
import { resolveQuotationToken, acceptQuotation, rejectQuotation, requestQuotationChanges } from "@/modules/quotations/quotation";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toErrorResult(error: unknown): ActionResult {
  return { ok: false, error: userMessage(error, "Something went wrong.") };
}

export async function acceptQuotationAction(token: string): Promise<ActionResult> {
  if (await publicActionLimited("quote-link")) return { ok: false, error: "Too many attempts. Please try again later." };
  const resolved = await resolveQuotationToken(token);
  if (!resolved) return { ok: false, error: "This link is no longer valid." };
  try {
    await acceptQuotation(resolved.organizationId, resolved.quotationId);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quote/${token}`);
  return { ok: true };
}

export async function rejectQuotationAction(token: string, message: string): Promise<ActionResult> {
  if (await publicActionLimited("quote-link")) return { ok: false, error: "Too many attempts. Please try again later." };
  const resolved = await resolveQuotationToken(token);
  if (!resolved) return { ok: false, error: "This link is no longer valid." };
  try {
    await rejectQuotation(resolved.organizationId, resolved.quotationId, message || undefined);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quote/${token}`);
  return { ok: true };
}

export async function requestQuotationChangesAction(token: string, message: string): Promise<ActionResult> {
  if (await publicActionLimited("quote-link")) return { ok: false, error: "Too many attempts. Please try again later." };
  const resolved = await resolveQuotationToken(token);
  if (!resolved) return { ok: false, error: "This link is no longer valid." };
  try {
    await requestQuotationChanges(resolved.organizationId, resolved.quotationId, message || undefined);
  } catch (error) {
    return toErrorResult(error);
  }
  revalidatePath(`/quote/${token}`);
  return { ok: true };
}

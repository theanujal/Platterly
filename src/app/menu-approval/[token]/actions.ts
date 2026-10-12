"use server";

import { headers } from "next/headers";
import { isRateLimited } from "@/lib/rate-limit";
import { resolveApprovalLink } from "@/modules/menu-approvals/approval-link";
import { disableShare, enableShare } from "@/modules/orders/order-share";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { createPaymentLink } from "@/modules/payments/payment-links";
import { PaymentError } from "@/modules/payments/payment";
import {
  requestChangesViaLink,
  submitVenueViaLink,
  askAboutApprovedMenuViaLink,
  VenueDetailsError,
  type VenueDetailsInput,
} from "@/modules/menu-approvals/approval-link";

export type ActionResult = { ok: true } | { ok: false; error: string };

const INACTIVE = "This link is no longer active. If you've already responded, there's nothing more to do — otherwise please contact your caterer.";
const MAX_NOTE_LENGTH = 2000;

/** Anonymous, unauthenticated endpoint — cap attempts per IP (in-memory, best-effort; see rate-limit.ts). */
async function tooManyRequests(): Promise<boolean> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return isRateLimited(`menu-approval:${ip}`, 30, 60 * 60 * 1000);
}

export async function requestMenuChangesAction(token: string, note: string): Promise<ActionResult> {
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: "Please describe the changes you'd like." };
  if (trimmed.length > MAX_NOTE_LENGTH) return { ok: false, error: `Please keep this under ${MAX_NOTE_LENGTH} characters.` };
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    const result = await requestChangesViaLink(token, trimmed);
    return result.ok ? { ok: true } : { ok: false, error: INACTIVE };
  } catch (error) {
    console.error("[menu-approval]", error);
    return { ok: false, error: INACTIVE };
  }
}

/** The Venue & Delivery form, sent after approving. Only a plain validation message (VenueDetailsError) reaches the customer. */
export async function submitVenueAction(token: string, input: VenueDetailsInput): Promise<ActionResult> {
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    const result = await submitVenueViaLink(token, input);
    return result.ok ? { ok: true } : { ok: false, error: INACTIVE };
  } catch (error) {
    if (error instanceof VenueDetailsError) return { ok: false, error: error.message };
    console.error("[menu-approval]", error);
    return { ok: false, error: INACTIVE };
  }
}

/** "Request Menu Changes" on an already-approved menu: a note for the team, nothing is reopened automatically. */
export async function askAboutApprovedMenuAction(token: string, note: string): Promise<ActionResult> {
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: "Please describe the changes you'd like." };
  if (trimmed.length > MAX_NOTE_LENGTH) return { ok: false, error: `Please keep this under ${MAX_NOTE_LENGTH} characters.` };
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    const result = await askAboutApprovedMenuViaLink(token, trimmed);
    return result.ok ? { ok: true } : { ok: false, error: INACTIVE };
  } catch (error) {
    console.error("[menu-approval]", error);
    return { ok: false, error: INACTIVE };
  }
}

/**
 * The Payment box on the Confirmation stage: the customer picks Advance, Full amount or a custom amount and is
 * sent to the kitchen's payment page for it (Razorpay or UPI QR). Only available once the menu is final.
 */
export async function createApprovalPaymentLinkAction(token: string, kind: "ADVANCE" | "FULL" | "CUSTOM", amount?: number): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  const link = await resolveApprovalLink(token);
  if (!link.ok || link.stage !== "CONFIRMATION" || !link.orderId) return { ok: false, error: INACTIVE };
  try {
    const created = await createPaymentLink({
      organizationId: link.organizationId,
      orderId: link.orderId,
      kind: kind === "FULL" ? "BALANCE" : kind,
      amount,
    });
    return { ok: true, path: new URL(created.url).pathname };
  } catch (error) {
    if (error instanceof PaymentError) return { ok: false, error: error.message };
    console.error("[menu-approval]", error);
    return { ok: false, error: INACTIVE };
  }
}

/**
 * "Share with family & team" on the Confirmation page: switches the read-only share link on (returning the link and its
 * QR) or off (the link stops working for everyone). Reached only with the customer's own approval link.
 */
export async function setOrderSharingAction(token: string, on: boolean): Promise<{ ok: true; url: string | null; qr: string | null } | { ok: false; error: string }> {
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  const link = await resolveApprovalLink(token);
  if (!link.ok || link.stage === "REVIEW" || !link.orderId) return { ok: false, error: INACTIVE };
  try {
    if (!on) {
      await disableShare(link.organizationId, link.orderId);
      return { ok: true, url: null, qr: null };
    }
    const url = await enableShare(link.organizationId, link.orderId);
    if (!url) return { ok: false, error: INACTIVE };
    return { ok: true, url, qr: await generateQrCodeDataUrl(url) };
  } catch (error) {
    console.error("[menu-approval]", error);
    return { ok: false, error: INACTIVE };
  }
}

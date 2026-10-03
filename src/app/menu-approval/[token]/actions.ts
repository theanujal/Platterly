"use server";

import { headers } from "next/headers";
import { isRateLimited } from "@/lib/rate-limit";
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

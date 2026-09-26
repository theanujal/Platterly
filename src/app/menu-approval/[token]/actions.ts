"use server";

import { headers } from "next/headers";
import { isRateLimited } from "@/lib/rate-limit";
import { approveViaLink, requestChangesViaLink } from "@/modules/menu-approvals/approval-link";

export type ActionResult = { ok: true } | { ok: false; error: string };

const INACTIVE = "This link is no longer active. If you've already responded, there's nothing more to do — otherwise please contact your caterer.";
const MAX_NOTE_LENGTH = 2000;

/** Anonymous, unauthenticated endpoint — cap attempts per IP (in-memory, best-effort; see rate-limit.ts). */
async function tooManyRequests(): Promise<boolean> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return isRateLimited(`menu-approval:${ip}`, 30, 60 * 60 * 1000);
}

/** The customer's "Approve Menu". Every check (token, version, status) is re-run server-side in approveViaLink. */
export async function approveMenuAction(token: string): Promise<ActionResult> {
  if (await tooManyRequests()) return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    const result = await approveViaLink(token);
    return result.ok ? { ok: true } : { ok: false, error: INACTIVE };
  } catch (error) {
    // A double-click races the first approval; the loser hits an invalid transition — same message as an inactive link.
    console.error("[menu-approval]", error);
    return { ok: false, error: INACTIVE };
  }
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

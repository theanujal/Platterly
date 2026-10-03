import type { PushPromptState } from "@/generated/prisma/enums";

/**
 * When to show the "Stay updated" push popup (AJ, 2026-10-03): the moment the account exists, then again every
 * 3 days after "Maybe Later", up to 5 times in all. "Don't Ask Again" stops it for good, as does enabling.
 * Pure functions so the schedule is unit-tested without a browser.
 */
export const PROMPT_REPEAT_DAYS = 3;
export const PROMPT_MAX_ASKS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PromptRecord {
  pushPromptState: PushPromptState;
  pushPromptCount: number;
  pushPromptNextAt: Date | null;
}

export function shouldShowPrompt(user: PromptRecord, now: Date = new Date()): boolean {
  if (user.pushPromptState === "PENDING") return true;
  if (user.pushPromptState === "LATER") return user.pushPromptNextAt === null || user.pushPromptNextAt <= now;
  return false;
}

export type PromptAnswer = "enabled" | "later" | "never";

/** What to store after the person answers (closing the popup counts as "later"). */
export function nextPromptRecord(user: PromptRecord, answer: PromptAnswer, now: Date = new Date()): PromptRecord {
  if (answer === "enabled") return { pushPromptState: "ENABLED", pushPromptCount: user.pushPromptCount, pushPromptNextAt: null };
  if (answer === "never") return { pushPromptState: "NEVER", pushPromptCount: user.pushPromptCount, pushPromptNextAt: null };
  const asked = user.pushPromptCount + 1;
  if (asked >= PROMPT_MAX_ASKS) return { pushPromptState: "EXHAUSTED", pushPromptCount: asked, pushPromptNextAt: null };
  return { pushPromptState: "LATER", pushPromptCount: asked, pushPromptNextAt: new Date(now.getTime() + PROMPT_REPEAT_DAYS * DAY_MS) };
}

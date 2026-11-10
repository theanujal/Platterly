import { fail, isRecord, ok, type ParseResult } from "./result";

/**
 * Account reviews (AJ, 2026-11-10): when the OLD address cancels an email change, the Platform puts the account on hold, tells Ops, and keeps it on hold until
 * Ops marks the review verified. Both calls are signed POSTs with the platform-billing secret (not the read-only one), and the answers are signed by Ops with
 * the request's id. The Platform asks Ops whether a review is cleared when the held person tries to sign in, so Ops never has to call the Platform.
 */
export const PLATFORM_ACCOUNT_REVIEW_PATH = "/api/platform/account-reviews";
export const PLATFORM_ACCOUNT_REVIEW_STATUS_PATH = "/api/platform/account-reviews/status";

export const ACCOUNT_REVIEW_REASONS = ["not_me", "mistake", "other"] as const;
export type AccountReviewReason = (typeof ACCOUNT_REVIEW_REASONS)[number];

export interface AccountReviewRequest {
  /** The Platform's id for the email change; a repeat of the same id is answered the same. */
  reviewId: string;
  /** The identity provider's person id, so staff can find the person. */
  subject: string;
  oldEmail: string;
  newEmail: string;
  reason: AccountReviewReason;
  /** What the person wrote, at most 500 characters. */
  note: string;
  requestedAt: string;
}
export type AccountReviewStatus = "OPEN" | "CLEARED";

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export function parseAccountReviewRequest(input: unknown): ParseResult<AccountReviewRequest> {
  if (!isRecord(input)) return fail("the request must be an object");
  const { reviewId, subject, oldEmail, newEmail, reason, note, requestedAt } = input;
  if (!text(reviewId, 100) || !reviewId) return fail("reviewId is required");
  if (!text(subject, 100) || !subject) return fail("subject is required");
  if (!text(oldEmail, 254) || !EMAIL.test(oldEmail) || !text(newEmail, 254) || !EMAIL.test(newEmail)) return fail("oldEmail and newEmail must be email addresses");
  if (!ACCOUNT_REVIEW_REASONS.includes(reason as AccountReviewReason)) return fail("reason is not known");
  if (!text(note, 500)) return fail("note must be text of at most 500 characters");
  if (typeof requestedAt !== "string" || Number.isNaN(Date.parse(requestedAt))) return fail("requestedAt must be a date");
  return ok({ reviewId, subject, oldEmail, newEmail, reason: reason as AccountReviewReason, note: note.trim(), requestedAt });
}

export function parseAccountReviewStatusRequest(input: unknown): ParseResult<{ reviewId: string }> {
  if (!isRecord(input) || !text(input.reviewId, 100) || !input.reviewId) return fail("reviewId is required");
  return ok({ reviewId: input.reviewId });
}

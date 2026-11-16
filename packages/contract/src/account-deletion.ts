import { fail, isRecord, ok, type ParseResult } from "./result";

/**
 * Account deletion requests (AJ, 2026-11-15). One request type, made on the Account's My Profile page. For a business Admin it covers the business too. The
 * Platform tells Ops (a signed POST with the platform-billing secret, answers signed by Ops); staff approve or decline on Ops's Account deletions page; the
 * Platform asks Ops for the decision (pull, so Ops never calls the Platform) and acts on it. Nothing is removed on the request itself.
 */
export const PLATFORM_ACCOUNT_DELETION_PATH = "/api/platform/account-deletions";
export const PLATFORM_ACCOUNT_DELETION_STATUS_PATH = "/api/platform/account-deletions/status";
export const PLATFORM_ACCOUNT_DELETION_WITHDRAW_PATH = "/api/platform/account-deletions/withdraw";

/** The Platform reports that it has erased the person (and the business's central records): Ops then closes the request as ERASED. */
export const PLATFORM_ACCOUNT_DELETION_ERASED_PATH = "/api/platform/account-deletions/erased";

export const ACCOUNT_DELETION_STATUSES = ["PENDING", "APPROVED", "DECLINED", "WITHDRAWN", "RESTORED", "ERASED"] as const;
export type AccountDeletionStatus = (typeof ACCOUNT_DELETION_STATUSES)[number];

export interface AccountDeletionRequest {
  /** The Platform's id for the request; a repeat of the same id changes nothing. */
  requestId: string;
  /** The identity provider's person id. */
  subject: string;
  name: string;
  email: string;
  phone: string;
  /** The business the person is Admin of, when there is one. */
  businessId: string | null;
  businessName: string | null;
  /** Product keys the business uses. */
  products: string[];
  /** What the person wrote, at most 500 characters. */
  reason: string;
  requestedAt: string;
}

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export function parseAccountDeletionRequest(input: unknown): ParseResult<AccountDeletionRequest> {
  if (!isRecord(input)) return fail("the request must be an object");
  const { requestId, subject, name, email, phone, businessId, businessName, products, reason, requestedAt } = input;
  if (!text(requestId, 100) || !requestId) return fail("requestId is required");
  if (!text(subject, 100) || !subject) return fail("subject is required");
  if (!text(name, 200) || !text(phone, 40)) return fail("name and phone must be short text");
  if (!text(email, 254) || !EMAIL.test(email)) return fail("email must be an email address");
  if (businessId !== null && (!text(businessId, 100) || !businessId)) return fail("businessId must be an id or null");
  if (businessName !== null && !text(businessName, 200)) return fail("businessName must be text or null");
  if (!Array.isArray(products) || products.length > 20 || !products.every((p) => text(p, 60) && p)) return fail("products must be a short list of product keys");
  if (!text(reason, 500)) return fail("reason must be text of at most 500 characters");
  if (typeof requestedAt !== "string" || Number.isNaN(Date.parse(requestedAt))) return fail("requestedAt must be a date");
  return ok({ requestId, subject, name, email, phone, businessId: businessId as string | null, businessName: businessName as string | null, products: products as string[], reason: reason.trim(), requestedAt });
}

export function parseAccountDeletionIdRequest(input: unknown): ParseResult<{ requestId: string }> {
  if (!isRecord(input) || !text(input.requestId, 100) || !input.requestId) return fail("requestId is required");
  return ok({ requestId: input.requestId });
}

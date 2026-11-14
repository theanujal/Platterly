import { parseBuyer, type Buyer } from "./billing";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "./result";

/**
 * A business's saved billing details (F12.2.1): the name, address and GSTIN that start every purchase filled in and that the Account lets the Admin edit.
 * One record per business, kept by ops (the money side). The same checks run in the Store form, in the Account form and again in ops, so a hand-made request
 * cannot save a GSTIN or PIN code that the forms would have refused. An invoice keeps its own frozen copy of the details, so editing them never rewrites one.
 */

/** GSTIN: 15 characters, state code, PAN, entity, Z, check. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const PINCODE = /^\d{6}$/;

export type BuyerField = "name" | "addressLine1" | "city" | "state" | "postalCode" | "gstin";

/** Field by field problems with a set of billing details; empty when they are fine. GSTIN is optional, and accepted in lower case. */
export function checkBuyer(buyer: Buyer): Partial<Record<BuyerField, string>> {
  const errors: Partial<Record<BuyerField, string>> = {};
  if (!buyer.name?.trim()) errors.name = "Enter your business name.";
  if (!buyer.addressLine1?.trim()) errors.addressLine1 = "Enter the billing address.";
  if (!buyer.city?.trim()) errors.city = "Enter the city.";
  if (!buyer.state?.trim()) errors.state = "Enter the state.";
  if (!PINCODE.test(buyer.postalCode?.trim() ?? "")) errors.postalCode = "Enter a 6-digit PIN code.";
  const gstin = buyer.gstin?.trim().toUpperCase() ?? "";
  if (gstin && !GSTIN.test(gstin)) errors.gstin = "Enter a valid 15-character GSTIN, or leave it blank.";
  return errors;
}

/** What the Platform sends to save a business's billing details. */
export interface BillingProfileRequest {
  buyer: Buyer;
  /** Who made the change (the Platform's id for the signed-in Admin), kept in the audit log. */
  editedBy?: string;
}

export function parseBillingProfileRequest(input: unknown): ParseResult<BillingProfileRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  const buyer = parseBuyer(input.buyer);
  if (!buyer.ok) return buyer;
  const value: Buyer = { ...buyer.value, gstin: buyer.value.gstin ? buyer.value.gstin.toUpperCase() : null };
  const problems = checkBuyer(value);
  const first = Object.entries(problems)[0];
  if (first) return fail(`buyer.${first[0]}: ${first[1]}`);
  if (input.editedBy !== undefined && (typeof input.editedBy !== "string" || !input.editedBy || input.editedBy.length > 100)) return fail("editedBy must be short text");
  return ok({ buyer: value, ...(typeof input.editedBy === "string" ? { editedBy: input.editedBy } : {}) });
}

/** What ops answers: the saved details (null when the business has none yet) and when they last changed. */
export interface BillingProfileAnswer {
  profile: Buyer | null;
  updatedAt: string | null;
}

/** Checks ops's answer before it is believed. The saved details only need to be well formed (they were checked when saved), not re-checked field by field. */
export function parseBillingProfileAnswer(input: unknown): ParseResult<BillingProfileAnswer> {
  if (!isRecord(input) || !("profile" in input) || !("updatedAt" in input)) return fail("answer must have profile and updatedAt");
  if (input.profile === null) return input.updatedAt === null ? ok({ profile: null, updatedAt: null }) : fail("updatedAt must be null without a profile");
  const buyer = parseBuyer(input.profile);
  if (!buyer.ok) return buyer;
  if (!isIsoDate(input.updatedAt)) return fail("updatedAt must be a date");
  return ok({ profile: buyer.value, updatedAt: input.updatedAt });
}

/** `GET` reads (platform-reader secret), `PUT` saves (platform-billing secret): one business's billing details. */
export const platformBillingProfilePath = (businessId: string) => `/api/platform/businesses/${businessId}/billing-profile`;
/** The only address shape Ops lets through its sign-in gate for this route (the route checks the HMAC signature itself). */
export const PLATFORM_BILLING_PROFILE_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/billing-profile$/;

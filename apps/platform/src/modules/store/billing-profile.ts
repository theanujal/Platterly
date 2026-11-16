import "server-only";
import type { OpsReadFailure } from "./ops-catalogue";
import type { CheckoutFailure } from "./ops-checkout";

/**
 * The answers the Account's billing profile pages and API give when a read or a save fails. Only the business's
 * active Admin may read or change them (`billingAccess`); the business is never named by the request. Ops holds the details and checks them again on save.
 */
export type ProfileFailure = "not_signed_in" | "no_business" | "not_admin" | "bad_request" | OpsReadFailure | "not_found" | CheckoutFailure;
/** The same answer for the page and the API: which HTTP status a failure is. */
export const profileStatus = (reason: ProfileFailure): number =>
  reason === "not_signed_in" ? 401 : reason === "not_admin" ? 403 : reason === "no_business" ? 409 : reason === "bad_request" ? 422 : reason === "rejected" ? 400 : reason === "unknown_business" || reason === "not_found" ? 404 : reason === "not_configured" ? 503 : 502;

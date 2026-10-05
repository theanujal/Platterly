import "server-only";
import { ValidationError } from "@/lib/errors";
import { opsBillingOn } from "./config";

/**
 * With OPS_BILLING on, plans, subscriptions, the seller's billing details and the sidebar notice live in Platterly Ops. The catering copies would
 * be stale the moment someone edited them, so edits here are refused (the Super Admin screens also say so). A no-op otherwise.
 */
export function guardNotManagedByOps(what = "Plans and billing"): void {
  if (opsBillingOn()) throw new ValidationError(`${what} are managed in Platterly Ops now. Make this change there.`);
}

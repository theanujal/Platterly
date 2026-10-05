import "server-only";
import { ValidationError } from "@/lib/errors";
import { opsBillingOn } from "./config";

/**
 * With OPS_BILLING on, plans, subscriptions and the seller's billing details live in Platterly Ops. The catering copies would
 * be stale the moment someone edited them, so edits here are refused (the Super Admin screens also say so). A no-op otherwise.
 */
export function guardNotManagedByOps(): void {
  if (opsBillingOn()) throw new ValidationError("Plans and billing are managed in Platterly Ops now. Make this change there.");
}

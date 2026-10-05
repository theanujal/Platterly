/**
 * Ops <-> product contract (docs/ops-contract.md). The version is sent on every call as X-Platterly-Contract.
 * Additive changes (new optional fields, new event types) keep the number; a breaking change raises it.
 */
export const CONTRACT_VERSION = 1;

/** The product lifecycle states a subscription (and so a snapshot) can be in. */
export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "LOCKED", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_INTERVALS = ["MONTHLY", "ANNUAL"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** AJ, 2026-10-05: a product keeps working on its last snapshot this long after `validUntil` when ops is silent. */
export const GRACE_DAYS = 5;

/** AJ, 2026-10-05: a deleted business is suspended and restorable for this long before the product really deletes it. */
export const DELETE_RETENTION_DAYS = 30;

/** Signed requests older (or newer) than this are rejected. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

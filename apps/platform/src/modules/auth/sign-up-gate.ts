/**
 * Sign-up is open only to a person who started from a registered product (plan rule, AJ 2026-11-10). The sign-up form sends the product it was opened for in this
 * header, and the identity provider refuses `/sign-up/email` unless it names a registered, enabled product (`isRegisteredProduct`). This file has no server imports so
 * the form (a client component) can share the name.
 *
 * This is a policy gate, not a hard lock: a hand-written request can copy a product's id. A hard lock would need a token signed by the product's own sign-in.
 */
export const PRODUCT_CLIENT_HEADER = "x-platterly-client";

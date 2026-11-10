/**
 * Sign-up is open only to a person who started from a registered product (plan rule, AJ 2026-11-10), and the server checks it by itself.
 * A product sends the person to the central sign-in through the identity provider's authorize step; the provider SIGNS the address it sends them on to (the
 * `sig` and `exp` parts of the page address). The sign-up form sends that address in this header, and the identity provider refuses `/sign-up/email` unless
 * its signature and expiry are good AND the product it names is registered and enabled (`signedProduct`, in sign-up-origin.ts). A product name typed by hand
 * is worth nothing: only the provider can sign. This file has no server imports so the form (a client component) can share the name.
 *
 * What it proves: this person arrived through that product's real sign-in link. The link is public (anyone may start it), exactly as the product's own
 * "Create an account" is public.
 */
export const OAUTH_QUERY_HEADER = "x-platterly-oauth-query";

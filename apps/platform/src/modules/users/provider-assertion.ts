import { normaliseEmail } from "./email";

// F3.1.2: the trusted "this email was verified by the identity provider" assertion.
//
// TRUST BOUNDARY. `mintProviderEmailAssertion` does NOT verify anything. It does not read, check or validate a provider token.
// It may be called only AFTER trusted provider-token validation has succeeded (issuer, audience, signature, expiry, nonce and the
// provider's own email_verified claim). Its job is only to turn that already-validated fact into an object that `findOrCreateBySubject`
// can tell apart from a caller-supplied boolean.
//
// Who may call it: in production, only the future token-validation code of F4.2.2. The plan does not name a module path for F4.2.2,
// so no production importer is allowed yet (see identity-link.guard.test.ts: PRODUCTION_MINT_IMPORTERS is empty). Tests may import it.
// A path is added to that allowlist only when AJ approves where the F4.2.2 code lives.
//
// How it is enforced: an assertion is an empty, frozen object registered in a module-private WeakMap together with the exact
// (provider, subject, normalised email) it was minted for. A lookalike object is not in the map, so it is refused. An assertion minted for one
// identity does not match another. The binding is held privately here and is not readable from the object.
declare const brand: unique symbol;
export type ProviderEmailAssertion = { readonly [brand]: "ProviderEmailAssertion" };

export type AssertionBinding = { provider: string; subject: string; email: string };

const issued = new WeakMap<object, AssertionBinding>();

export function mintProviderEmailAssertion(binding: AssertionBinding): ProviderEmailAssertion {
  const { provider, subject } = binding;
  const email = typeof binding.email === "string" ? normaliseEmail(binding.email) : null;
  if (typeof provider !== "string" || provider.trim() === "" || typeof subject !== "string" || subject.trim() === "" || email === null) {
    throw new TypeError("mintProviderEmailAssertion: provider, subject and a valid email are required");
  }
  const assertion = Object.freeze({}) as ProviderEmailAssertion;
  issued.set(assertion, { provider, subject, email });
  return assertion;
}

/** True only for an object minted by `mintProviderEmailAssertion` for exactly this provider, subject and (normalised) email. */
export function assertionMatches(candidate: unknown, binding: AssertionBinding): boolean {
  if (typeof candidate !== "object" || candidate === null) return false;
  const bound = issued.get(candidate);
  return bound !== undefined && bound.provider === binding.provider && bound.subject === binding.subject && bound.email === binding.email;
}

import { createHash } from "node:crypto";
import { isProductKey } from "@platterly/contract";
import type { PrismaClient } from "@/generated/prisma/client";
import { getIntegration } from "../integrations/registry";
import type { IdentityLinkClient } from "../users/identity-link";
import { linkVerifiedPerson } from "./business-created";
import { createOrganisation } from "./create";

// Single sign-up (AJ, 2026-11-14; docs/single-signup-business-plan.md). When a person verifies their email, the Account creates their business, makes them its Admin
// and attaches the product they signed up from, then asks that product to adopt the business (`organisation.link`, then `membership.changed`, delivered in that order).
// The product's own onboarding supplies the real business name later; until then the business carries the person's name. Safe to repeat: one business per person and product.

export type SignupPerson = { email: string; emailVerified: boolean; name: string };
export type SignupBusinessDeps = { prisma: PrismaClient; readPerson: (subject: string) => Promise<SignupPerson | null>; linkClient?: IdentityLinkClient };
export type SignupBusinessResult = { ok: true; organisationId: string; created: boolean } | { ok: false; reason: string };

/** The business's name until the product's onboarding sets the real one: the person's own name, 1 to 120 characters. */
export function placeholderBusinessName(personName: string): string {
  const name = personName.trim().replace(/\s+/g, " ").slice(0, 120).trim();
  return name || "My business";
}

/** The same person and product always give the same key, so a repeated verification returns the business already made. */
export const signupIdempotencyKey = (subject: string, productKey: string): string => `signup-${productKey}-${createHash("sha256").update(subject).digest("hex").slice(0, 32)}`;

export async function createBusinessForSignup(deps: SignupBusinessDeps, input: { subject: string; productKey: string }): Promise<SignupBusinessResult> {
  if (!isProductKey(input.productKey)) return { ok: false, reason: "unknown_product" };
  const integration = await getIntegration(deps.prisma, input.productKey);
  if (!integration || integration.status !== "current") return { ok: false, reason: "product_not_current" };
  const linked = await linkVerifiedPerson({ readPerson: deps.readPerson, linkClient: deps.linkClient }, input.subject);
  if (!linked.ok) return { ok: false, reason: linked.reason };
  const ref = `signup:${input.productKey}`;
  const result = await deps.prisma.$transaction((tx) =>
    createOrganisation(tx, { initiator: { kind: "system", ref }, executor: { kind: "system", ref }, requestId: signupIdempotencyKey(input.subject, input.productKey) }, {
      userId: linked.userId,
      idempotencyKey: signupIdempotencyKey(input.subject, input.productKey),
      name: placeholderBusinessName(linked.person.name),
      productKey: input.productKey,
      queueLink: true,
    }),
  );
  return result.ok ? { ok: true, organisationId: result.organisationId, created: result.created } : { ok: false, reason: result.code };
}

import "server-only";
import { isReservedPathSegment } from "@/lib/routing/reserved-words";
import { prisma } from "@/lib/db";

/**
 * Chunk 3 Group 3.2 — the updated product doc's public-link business rule
 * (§14/§26): letters, numbers, hyphens and underscores only, max 20
 * characters. Chunk 8 (self-service storefront slug) will reuse this same
 * validator.
 */
const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_SLUG_LENGTH = 20;

export interface SlugValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSlugFormat(slug: string): SlugValidationResult {
  if (slug.length === 0) {
    return { valid: false, error: "Slug is required." };
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return { valid: false, error: `Slug must be ${MAX_SLUG_LENGTH} characters or fewer.` };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return { valid: false, error: "Slug may only contain letters, numbers, hyphens and underscores." };
  }
  if (isReservedPathSegment(slug)) {
    return { valid: false, error: "This slug is reserved and cannot be used." };
  }
  return { valid: true };
}

/**
 * Chunk 4 Group 4.2 — lowercases, collapses anything outside
 * [a-z0-9_-] into a single hyphen, trims leading/trailing hyphens, and caps
 * at MAX_SLUG_LENGTH. Falls back to "caterer" if nothing alphanumeric
 * survives (e.g. a business name written entirely in a non-Latin script).
 */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "caterer";
}

/**
 * Onboarding (Chunk 4) auto-generates a slug from the business name — the
 * caterer customizes it later via Chunk 8's self-service flow. Appends
 * "-2", "-3", ... on collision, re-validating (format + reserved words)
 * and truncating the base so the suffixed result still respects
 * MAX_SLUG_LENGTH.
 */
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const validation = validateSlugFormat(candidate);
    if (validation.valid) {
      const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    const suffixStr = `-${suffix}`;
    candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffixStr.length)}${suffixStr}`;
    suffix += 1;
  }
}

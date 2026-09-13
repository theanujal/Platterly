import "server-only";
import { isReservedPathSegment } from "@/lib/routing/reserved-words";

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

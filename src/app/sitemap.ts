import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/lib/seo/canonical";
import { listPublishedTenantSlugs } from "@/modules/tenants/tenant";

// Without this, Next prerenders the route at build time (no dynamic API
// call is visible to it inside a Prisma query) and a tenant claiming a slug
// after the last deploy wouldn't appear until the next one.
export const dynamic = "force-dynamic";

/**
 * Chunk 8 Group 8.3 — one entry per published tenant storefront ("published"
 * = the same `status: ACTIVE` + `slugChangeCount > 0` definition
 * `getPublishedTenantBySlug` uses). Unpublished/placeholder-slug tenants
 * stay out of the sitemap entirely, not just unlinked.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenants = await listPublishedTenantSlugs();
  return tenants.map((tenant) => ({
    url: canonicalUrl(`/${tenant.slug}`),
    changeFrequency: "daily",
  }));
}

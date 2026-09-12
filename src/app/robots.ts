import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/lib/seo/canonical";

/**
 * Chunk 1 Group 1.4: disallow the two reserved login paths and any future
 * authenticated app path; the `[tenantSlug]` storefront catch-all stays
 * crawlable by default. Chunk 8 doesn't need to touch this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/super", "/kitchenlogin", "/api/"],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}

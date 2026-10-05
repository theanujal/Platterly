import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { canonicalUrl } from "@/lib/seo/canonical";
import { hostKind, requestHost } from "@/lib/routing/hosts";

/**
 * Only a kitchen's own storefront (`/{kitchen-slug}`) is meant to be indexed;
 * the proxy adds `X-Robots-Tag: noindex` to every other page (customer links,
 * admin, ops). Those customer links are deliberately NOT disallowed here: a
 * crawler has to be able to fetch a page to see its noindex. The ops host
 * has nothing to crawl, so it disallows everything.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (hostKind(requestHost(await headers())) === "ops") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/kitchenlogin", "/api/"],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}

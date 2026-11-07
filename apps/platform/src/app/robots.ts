import type { MetadataRoute } from "next";

/** Every Platform host (auth, account, store) is private: crawlers are asked to stay away. The `X-Robots-Tag: noindex` header in next.config.ts says the same on every response. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

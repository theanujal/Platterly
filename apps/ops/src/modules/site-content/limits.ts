/** What the site can show without breaking its layout. */
export const SITE_LIMITS = {
  noticeText: 200,
  noticeLinkLabel: 30,
  noticeLinkHref: 300,
  reply: 200,
  title: 140,
  excerpt: 300,
  author: 80,
  tag: 30,
  releaseBody: 600,
  summary: 300,
  postBody: 40_000,
  pageBody: 60_000,
} as const;

export const COLOURWAYS = ["sunrise", "blossom", "citrus", "dusk"] as const;
export const RELEASE_KINDS = ["new", "improved"] as const;

/** The policy pages the site has. Their addresses are fixed, so only their text can change. */
export const LEGAL_SLUGS = [
  { slug: "privacy", label: "Privacy policy" },
  { slug: "terms", label: "Terms of service" },
  { slug: "refund", label: "Refund and cancellation" },
  { slug: "cookie-policy", label: "Cookie policy" },
  { slug: "shipping-and-delivery", label: "Shipping and delivery" },
  { slug: "security", label: "Security" },
] as const;

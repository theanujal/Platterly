import type { NextConfig } from "next";
import { RESERVED_PATH_SEGMENTS } from "./src/lib/routing/reserved-words";

// Chunk 12 — the public storefront is meant to be embedded on a caterer's own
// website (Settings -> Integration -> Iframe), but nothing else in the app
// should ever render inside someone else's page (clickjacking on the admin
// panel, login and Super Admin). So framing is denied everywhere by default
// and re-allowed for exactly two things: the storefront root `/{slug}` (any
// single path segment that isn't one of the app's own reserved routes) and
// the order flow under `/{slug}/plan/...`. Later rules win for the same key.
const reservedAlternation = RESERVED_PATH_SEGMENTS.map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

const nextConfig: NextConfig = {
  // Default "bottom-left" sits exactly on top of the new sidebar's footer
  // (Sign out button) — moved out of the way rather than disabling the dev
  // indicator entirely. Caught by a real Playwright click hang: Next's own
  // <nextjs-portal> intercepted pointer events meant for Sign out.
  devIndicators: {
    position: "bottom-right",
  },
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] },
      {
        source: `/:tenantSlug((?!(?:${reservedAlternation})$)[^/]+)`,
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      { source: "/:tenantSlug/plan/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
    ];
  },
};

export default nextConfig;

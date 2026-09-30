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
  // Image uploads (logo, food items, menus, add-ons, event types, inventory) go through
  // Server Actions as multipart form data. The default 1MB body limit rejected any photo
  // over 1MB with "Body exceeded 1 MB limit". The app's own rule is 4MB per image
  // (catalog-image.ts, logos, ImageDropzone), so the body limit sits just above it to
  // leave room for the rest of the form.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default "bottom-left" sits exactly on top of the new sidebar's footer
  // (Sign out button) — moved out of the way rather than disabling the dev
  // indicator entirely. Caught by a real Playwright click hang: Next's own
  // <nextjs-portal> intercepted pointer events meant for Sign out.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;

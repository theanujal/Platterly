import { defineConfig } from "@playwright/test";

/**
 * Captures the marketing site's pictures and clips from the real catering app. Run from the repo root with the
 * catering dev server up (`npm run dev` on port 3000): `npm run capture` inside apps/site. It signs up a throwaway demo
 * kitchen (invented names only), seeds believable data through the app's own public API plus a little SQL, takes the
 * shots, then deletes the kitchen. It never changes catering's code or any real kitchen's data.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  workers: 1,
  timeout: 15 * 60_000,
  reporter: [["list"]],
  use: { baseURL: process.env.PW_BASE_URL ?? "http://catering.localhost:3000", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "light" },
});

import { test, expect } from "@playwright/test";
import { signUpCaterer } from "./auth-helpers";
import { cleanupOnboardingTestUser, seedCalendarFixtures } from "./db";

/**
 * Phones and tablets: no page may scroll sideways. A sideways-scrolling page is the symptom of
 * content wider than the screen (the sidebar used to stay open on tablets and push the page
 * 60-250px off the right edge). Wide tables and code blocks must scroll inside their own card.
 */
const VIEWPORTS = [
  { name: "phone", width: 360, height: 740 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
];
const PAGES = [
  "/dashboard", "/orders", "/calendar", "/customers", "/menu-catalog/items", "/inventory", "/kitchen-dashboard",
  "/settings/account/user-profile", "/settings/team", "/settings/integration/iframe",
];

const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("no page scrolls sideways on a phone or a tablet", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-responsive-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email);
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  await seedCalendarFixtures(email, {
    orders: [3, 4, 5].map((offset) => ({ start: day(offset), end: day(offset), status: "APPROVED" as const, guests: 100 })),
    events: [],
  });
  const state = await page.context().storageState();

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, storageState: state });
    const view = await context.newPage();
    for (const path of PAGES) {
      await view.goto(path);
      await view.waitForLoadState("networkidle").catch(() => {});
      const overflow = await view.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${viewport.name} (${viewport.width}px) ${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    await context.close();
  }
});

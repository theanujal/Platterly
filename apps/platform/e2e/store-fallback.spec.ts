import { expect, test } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * The Store's fallback screens share one design (icon chip, heading, one line, one button). This spec covers "plans are not available" in a real browser: it
 * needs Ops NOT answering (OPS_BASE_URL set on the Platform but Ops stopped), so the Store cannot read plans. The other screens are covered where their state can
 * be made: "Set up your business first" in store-sso.spec.ts, "Only your business's Admin..." in store-not-admin.spec.ts, "could not find that product" in store.spec.ts.
 */
const STORE = "http://store.localhost:3300";

test("plans are not available: the Store home and Manage show the shared notice, with a way to try again", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndSignIn(page, newEmail(), `${STORE}/`);
  await expect(page).toHaveURL(`${STORE}/`);
  for (const path of ["/", "/manage/caterly"]) {
    await page.goto(`${STORE}${path}`);
    const notice = page.locator(".ps-notice");
    await expect(notice.getByRole("heading", { level: 1, name: "Plans are not available right now" })).toBeVisible();
    await expect(notice).toContainText("We could not load our plans and prices");
    await expect(notice.locator(".ps-notice-icon svg")).toBeVisible();
    await expect(notice.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/");
  }
  await page.screenshot({ path: "/tmp/store-unavailable.png" });
  await page.setViewportSize({ width: 375, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

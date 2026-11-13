import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * Store prototype (docs/store-first-slice-design.md, section 9): sample products, plans and bundles; no real payment. Every Store page needs a sign-in (see store-sso.spec.ts).
 * It tests the SAMPLE data, which the Store shows only when OPS_BASE_URL is not set: run it against a Platform server started without OPS_BASE_URL,
 * OPS_PLATFORM_READER_SECRET and OPS_PLATFORM_BILLING_SECRET (the usual dev launcher sets them, and then the Store is live and these tests cannot pass).
 * It registers people, so use a throwaway Platform database or remove them afterwards with apps/platform/scripts/clean-test-people.mjs --apply.
 */
const STORE = "http://store.localhost:3300";

/** Registers a new person and signs in through the central page; resolves once the Store page is back on screen. */
async function signInToStore(page: Page, path: string) {
  await registerAndSignIn(page, newEmail(), `${STORE}${path}`);
  await expect(page).toHaveURL(`${STORE}${path}`);
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const article = (page: Page, name: string) => page.getByRole("article", { name, exact: true });

async function fillDetails(page: Page) {
  await page.getByLabel("Business name").fill("Spice Route Caterers");
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("PIN code").fill("411001");
}

test.describe("Store home", () => {
  // The Store is never public (2026-11-07): the home, like Manage, asks for a sign-in first.
  test.beforeEach(async ({ page }) => {
    await signInToStore(page, "/");
  });

  test("opens on Subscribed products with renewal date and amount and a Manage link, and no frequency filter or group headings", async ({ page }) => {
    await page.goto(`${STORE}/`);
    await expect(page.getByRole("note")).toContainText("Prototype with sample data");
    await expect(tab(page, "Subscribed products")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Billing frequency")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(0);
    const caterly = article(page, "Caterly");
    await expect(caterly).toContainText("Growth");
    await expect(caterly).toContainText("Next renewal date: 18 Apr 2027");
    await expect(caterly).toContainText("Renewal amount: ₹29,500 / year");
    await expect(article(page, "Rivo")).toContainText("Renewal amount: ₹2,124 / month");
    await expect(article(page, "Stockroom")).toHaveCount(0);
    await expect(caterly.getByRole("link", { name: /Manage/ })).toHaveAttribute("href", "/manage/caterly");
  });

  test("On trial and Unsubscribed products show their own products and actions", async ({ page }) => {
    await page.goto(`${STORE}/`);
    await tab(page, "On trial products").click();
    await expect(article(page, "Stockroom")).toContainText("Trial ends on 15 Nov 2026");
    await expect(article(page, "Stockroom").getByRole("link", { name: /Choose a plan/ })).toHaveAttribute("href", "/manage/stockroom");
    await expect(article(page, "Caterly")).toHaveCount(0);
    await tab(page, "Unsubscribed products").click();
    await expect(article(page, "Tabletop").getByRole("link", { name: /View plans/ })).toHaveAttribute("href", "/manage/tabletop");
    await expect(article(page, "Stockroom")).toHaveCount(0);
  });

  test("Bundles tab shows a bundle with its included products and a worked-out saving, and no working checkout", async ({ page }) => {
    await page.goto(`${STORE}/`);
    await tab(page, "Bundles").click();
    const bundle = article(page, "Caterly Growth + Rivo Basic");
    await expect(bundle).toContainText("Includes Caterly and Rivo");
    await expect(bundle).toContainText("₹3,304 / month");
    await expect(bundle).toContainText("Save ₹590 a month");
    await expect(bundle).toContainText("₹35,400 / year");
    await expect(bundle).toContainText("Save ₹3,540 a year");
    await expect(bundle.getByRole("button", { name: "View bundle" })).toBeDisabled();
  });

  test("search filters the products on the current tab and says so when nothing matches", async ({ page }) => {
    await page.goto(`${STORE}/`);
    await page.getByLabel("Search products").fill("riv");
    await expect(article(page, "Rivo")).toBeVisible();
    await expect(article(page, "Caterly")).toHaveCount(0);
    await page.getByLabel("Search products").fill("zzz");
    await expect(page.getByText("No subscribed products match.")).toBeVisible();
  });
});

test.describe("Manage a product", () => {
  test.beforeEach(async ({ page }) => {
    await signInToStore(page, "/manage/caterly");
  });

  test("lists every plan of the product and labels each one Current plan, Upgrade or Downgrade", async ({ page }) => {
    await page.goto(`${STORE}/manage/caterly`);
    await expect(page.getByRole("heading", { level: 1, name: "Manage your Caterly subscription" })).toBeVisible();
    await expect(page.getByText(/You are on Growth, billed yearly\. Next renewal: 18 Apr 2027/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Annual" })).toHaveAttribute("aria-pressed", "true");
    await expect(article(page, "Growth").getByRole("button", { name: "Current plan" })).toBeDisabled();
    await expect(article(page, "Pro").getByRole("button", { name: "Upgrade" })).toBeEnabled();
    await expect(article(page, "Starter").getByRole("button", { name: "Downgrade" })).toBeDisabled(); // monthly only, and Annual is selected
    await page.getByRole("button", { name: "Monthly" }).click();
    await expect(article(page, "Starter").getByRole("button", { name: "Downgrade" })).toBeEnabled();
    await expect(article(page, "Starter").getByTestId("total")).toHaveText("₹1,180");
    await expect(page.getByText("Show features")).toHaveCount(0);
    await expect(article(page, "Pro")).toContainText("Inventory, purchasing and reports");
    await expect(article(page, "Starter")).toContainText("50 events a month");
    await page.getByText("Compare plans in detail").click();
    await expect(page.getByRole("row", { name: /Growth/ })).toContainText("₹29,500");
  });

  test("a trial or unsubscribed product offers Subscribe on every plan", async ({ page }) => {
    await page.goto(`${STORE}/manage/stockroom`);
    await expect(page.getByText(/Your trial ends on 15 Nov 2026/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe" })).toHaveCount(2);
    await page.goto(`${STORE}/manage/tabletop`);
    await expect(page.getByRole("button", { name: "Subscribe" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  });

  test("upgrade: Confirm payment (details and sample payment on one screen) then Confirmation, with the plan's own amounts", async ({ page }) => {
    await page.goto(`${STORE}/manage/caterly`);
    await article(page, "Pro").getByRole("button", { name: "Upgrade" }).click();
    await expect(page.getByRole("list", { name: "Progress" }).getByRole("listitem")).toHaveText(["Choose plan", "Confirm payment", "Confirmation"]);
    await expect(page.getByRole("list", { name: "Progress" }).locator("[aria-current=step]")).toHaveText("Confirm payment");
    const summary = page.getByRole("complementary", { name: "Order summary" });
    await expect(summary).toContainText("Caterly Pro");
    await expect(summary.getByTestId("amount")).toHaveText("₹50,000");
    await expect(summary.getByTestId("gst")).toHaveText("₹9,000");
    await expect(summary.getByTestId("total")).toHaveText("₹59,000");
    await expect(summary).toContainText("Total today");
    await expect(page.getByLabel(/Coupon code/)).toBeDisabled();

    await expect(page.getByRole("group", { name: "Payment" })).toContainText("Sample payment. No card or UPI is used");
    await expect(page.getByRole("group", { name: "Payment" })).toContainText("₹59,000");
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    for (const message of ["Enter your business name.", "Enter the billing address.", "Enter the city.", "Enter the state.", "Enter a 6-digit PIN code."]) await expect(page.getByText(message)).toBeVisible();
    await fillDetails(page);
    await page.getByLabel("GSTIN").fill("NOTAGSTIN");
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    await expect(page.getByText(/valid 15-character GSTIN/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Confirmation" })).toHaveCount(0);
    await page.getByLabel("GSTIN").fill("27ABCDE1234F1Z5");
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    const done = page.getByRole("region", { name: "Confirmation" });
    await expect(done.getByRole("heading", { name: "Upgrade confirmed" })).toBeVisible();
    await expect(done).toContainText("Sample only. Nothing was saved or charged");
    await done.getByRole("link", { name: "Back to Store" }).click();
    await expect(tab(page, "Subscribed products")).toBeVisible();
    await expect(article(page, "Caterly")).toContainText("Growth"); // nothing was saved
  });

  test("downgrade: no payment step, says nothing is charged today and when the new plan starts", async ({ page }) => {
    await page.goto(`${STORE}/manage/caterly`);
    await page.getByRole("button", { name: "Monthly" }).click();
    await article(page, "Starter").getByRole("button", { name: "Downgrade" }).click();
    await expect(page.getByRole("list", { name: "Progress" }).getByRole("listitem")).toHaveText(["Choose plan", "Confirm downgrade", "Confirmation"]);
    await expect(page.getByRole("group", { name: "Payment" })).toHaveCount(0);
    const summary = page.getByRole("complementary", { name: "Order summary" });
    await expect(summary).toContainText("No charge today. This plan starts at your next renewal.");
    await expect(summary).toContainText("Total from 18 Apr 2027");
    await fillDetails(page);
    await page.getByRole("button", { name: "Schedule downgrade" }).click();
    const done = page.getByRole("region", { name: "Confirmation" });
    await expect(done.getByRole("heading", { name: "Downgrade scheduled" })).toBeVisible();
    await expect(done).toContainText("You move to Starter on 18 Apr 2027. Until then you keep Growth, and nothing is charged today.");
  });

  test("a new subscription on an unsubscribed product goes through payment to Order confirmed; Back returns to the plans", async ({ page }) => {
    await page.goto(`${STORE}/manage/tabletop`);
    await article(page, "Standard").getByRole("button", { name: "Subscribe" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(article(page, "Plus")).toBeVisible();
    await article(page, "Plus").getByRole("button", { name: "Subscribe" }).click();
    await fillDetails(page);
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();
  });

  test("Cancel subscription asks first, can be dismissed, and a confirmed cancel says nothing was cancelled", async ({ page }) => {
    await page.goto(`${STORE}/manage/rivo`);
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    const box = page.getByRole("alertdialog", { name: "Cancel subscription" });
    await expect(box).toContainText("run out as usual, until 6 Dec 2026");
    await box.getByRole("button", { name: "Keep subscription" }).click();
    await expect(box).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await expect(page.getByRole("status")).toHaveText("Sample only: nothing was cancelled.");
  });

  test("an unknown product shows a friendly message", async ({ page }) => {
    await page.goto(`${STORE}/manage/nope`);
    await expect(page.getByRole("heading", { name: "We could not find that product" })).toBeVisible();
  });

  test("home and manage work on a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/", "/manage/caterly"]) {
      await page.goto(`${STORE}${path}`);
      await expect(page.getByRole("note")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Store header and footer", () => {
  test("every Store page has a header with the logo link, Help and the signed-in person, and a footer with contact, sales and legal links", async ({ page }) => {
    await signInToStore(page, "/manage/caterly");
    for (const path of ["/", "/manage/caterly", "/manage/nope"]) {
      await page.goto(`${STORE}${path}`);
      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: "Platterly Store home" })).toHaveAttribute("href", "/");
      await expect(header.getByRole("link", { name: "Help" })).toHaveAttribute("href", "https://platterly.in/contact/");
      await expect(header).toContainText("E2E Person");
      await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByRole("link", { name: "hello@platterly.in" })).toHaveAttribute("href", "mailto:hello@platterly.in");
      await expect(footer.getByRole("link", { name: "+91 7624964646" })).toHaveAttribute("href", "tel:+917624964646");
      await expect(footer.getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", "https://platterly.in/talk-to-us/");
      await expect(footer.getByRole("navigation", { name: "Legal" }).getByRole("link").first()).toHaveText("Platterly.in");
      await expect(footer.getByRole("link", { name: "Platterly.in", exact: true })).toHaveAttribute("href", "https://platterly.in/");
      for (const [name, path2] of [["Terms of Service", "terms"], ["Privacy Policy", "privacy"], ["Security", "security"], ["Refunds", "refund"]]) {
        await expect(footer.getByRole("link", { name })).toHaveAttribute("href", `https://platterly.in/${path2}/`);
      }
      await expect(footer).toContainText(/© \d{4} Platterly\. All rights reserved\./);
    }
    await page.getByRole("link", { name: "Platterly Store home" }).click();
    await expect(page).toHaveURL(`${STORE}/`);
  });

  test("the footer sits at the bottom of a short page, and the header and footer fit a phone without sideways scrolling", async ({ page }) => {
    await signInToStore(page, "/manage/nope");
    const box = await page.getByRole("contentinfo").boundingBox();
    const height = await page.evaluate(() => window.innerHeight);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(height - 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${STORE}/`);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Store host routing", () => {
  test("the Store answers on the store host only; account, auth and bare hosts do not show it", async ({ page, request }) => {
    await page.goto("http://account.localhost:3300/");
    await expect(tab(page, "Subscribed products")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Platterly Store home" })).toHaveCount(0);
    await page.goto("http://auth.localhost:3300/");
    await expect(tab(page, "Subscribed products")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Platterly Store home" })).toHaveCount(0);
    await expect(page.getByText("Platterly auth", { exact: true })).toBeVisible();
    expect((await request.get("http://localhost:3300/")).status()).toBe(404);
    for (const host of ["account.localhost:3300", "auth.localhost:3300", "localhost:3300"]) expect((await request.get(`http://${host}/manage/caterly`)).status(), host).toBe(404);
  });

  test("the Account pages still answer 404 on the store host", async ({ request }) => {
    for (const path of ["/business", "/products", "/profile", "/security"]) expect((await request.get(`${STORE}${path}`)).status(), path).toBe(404);
    expect((await request.get(`${STORE}/api/health`)).status()).toBe(200);
  });
});

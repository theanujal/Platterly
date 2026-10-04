import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedLeadFromVisit } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 22: where storefront visitors come from. Three real browser visits (a tagged WhatsApp link, a click from Google, a
 * frame on another page), then the owner reads them in Reports > Storefront, including the IP, and sees where a lead came from.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("visits are recorded with their source, shown in the report and on the lead", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const email = `e2e-visits-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const slug = `visits-${Date.now().toString().slice(-6)}`;
  await signUpCaterer(page, email, { firstName: "Visit", lastName: "Tester", closeClaimDialog: false });
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // The link page explains the tags.
  await page.goto("/settings/integration/public-menu-link");
  await expect(page.getByTestId("src-tags")).toContainText("?src=whatsapp");

  const visit = async (open: (p: import("@playwright/test").Page) => Promise<void>, inFrame = false) => {
    const context = await browser.newContext();
    const visitor = await context.newPage();
    const recorded = visitor.waitForResponse((r) => r.url().endsWith("/api/visit") && r.request().method() === "POST");
    await open(visitor);
    const body = await (await recorded).json();
    expect(typeof body.visitId).toBe("string");
    const notice = inFrame ? visitor.frameLocator("iframe").getByTestId("visit-notice") : visitor.getByTestId("visit-notice");
    await expect(notice).toContainText("deleted after 90 days");
    await context.close();
  };

  await visit((p) => p.goto(`/${slug}?src=whatsapp`).then(() => undefined));
  await visit((p) => p.goto(`/${slug}`, { referer: "https://www.google.com/" }).then(() => undefined));
  await visit(async (p) => {
    await p.goto("/no-such-page-for-host");
    await p.setContent(`<iframe src="${new URL(`/${slug}`, page.url()).toString()}" style="width:800px;height:600px"></iframe>`);
  }, true);

  await page.goto("/reports?tab=storefront");
  await expect(page.getByTestId("sf-visits")).toContainText("3");
  const sources = page.getByTestId("bar-list").first();
  await expect(sources).toContainText("WhatsApp");
  await expect(sources).toContainText("Google");
  await expect(sources).toContainText("Embedded on a website");
  await expect(page.getByTestId("sf-recent")).toContainText("127.0.0.1");
  await expect(page.getByTestId("sf-recent")).toContainText("WhatsApp");
  await expect(page.getByTestId("sf-channels")).toContainText("Public storefront");

  // A lead that started from the WhatsApp visit says so on their page.
  const customerId = await seedLeadFromVisit(email, "WHATSAPP");
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByTestId("customer-arrival")).toContainText("Arrived from WhatsApp");
  await expect(page.getByTestId("customer-arrival")).toContainText("127.0.0.1");

  // The other tabs open and show their own figures.
  for (const [tab, testId] of [["menu", "menu-report"], ["inventory", "inventory-report"], ["finance", "finance-report"]] as const) {
    await page.goto(`/reports?tab=${tab}`);
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});

import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Stock In accepts costs to 2 decimals and quantities to 3. The browser's own step check stops a finer figure first; if that
 * is bypassed (an older page, a script) the server refuses it with a message, and nothing is booked either way.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("a cost finer than 2 decimals or a quantity finer than 3 is refused and nothing is stocked", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-precision-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const item = `Flour ${Date.now().toString().slice(-6)}`;

  await signUpCaterer(page, email, { firstName: "Pre", lastName: "Cision", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(item);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(item)).toBeVisible();

  await page.getByRole("button", { name: `Record stock movement for ${item}` }).click();
  const dialog = page.getByRole("dialog", { name: /Stock Movement/ });
  await dialog.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Stock In" }).click();
  const quantity = dialog.locator("#stock-quantity");
  const cost = dialog.locator("#stock-cost");

  // 1. The browser refuses a figure that does not fit the step, before anything is sent
  await quantity.fill("5");
  await cost.fill("0.004");
  await dialog.getByRole("button", { name: "Record movement" }).click();
  expect(await cost.evaluate((el: HTMLInputElement) => el.validity.stepMismatch)).toBe(true);
  await expect(dialog).toBeVisible();

  // 2. With the browser check bypassed, the server still refuses with a clear message (0.004 would otherwise be saved as a free 0.00)
  await dialog.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
  await dialog.getByRole("button", { name: "Record movement" }).click();
  await expect(dialog.locator("p[role=alert]")).toContainText("at most 2 decimal places");
  await cost.fill("12.345");
  await dialog.getByRole("button", { name: "Record movement" }).click();
  await expect(dialog.locator("p[role=alert]")).toContainText("at most 2 decimal places");

  await cost.fill("12.34");
  await quantity.fill("1.2345");
  await dialog.getByRole("button", { name: "Record movement" }).click();
  await expect(dialog.locator("p[role=alert]")).toContainText("at most 3 decimal places");

  // Nothing was stocked by the refused attempts
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", { name: "Discard your changes?" });
  if (await discard.isVisible().catch(() => false)) await discard.getByRole("button", { name: "Discard changes" }).click();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: item })).toContainText("0 kg");
});

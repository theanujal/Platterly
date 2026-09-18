import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 11 Group 11.3 — Kitchen-side admin review UI (`/menu-approvals`,
 * `/menu-approvals/[id]`). Builds a real Menu Type + Category + Food Item +
 * Event Type (with that Menu Type assigned), submits the public
 * event-details intake form as an anonymous customer (a brand-new
 * cookie-less browser context, same convention as e2e/quotations.spec.ts's
 * customer-side flow), approves the menu selection as that customer
 * (reaching KITCHEN_REVIEWING), then drives the admin side through
 * Approve -> Lock and confirms the final state.
 *
 * Also covers Group 11.5 — the Kitchen Dashboard (`/kitchen-dashboard`):
 * once locked, the menu selection should show up in the Pending column and
 * advance through Preparing -> Ready -> Completed as the kitchen works it.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("kitchen reviews, approves, and locks a customer's menu selection", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const email = `e2e-menu-approvals-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const slug = `kitchen-${suffix}`;

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Approvals");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Claim the custom link so the storefront (and its intake form) is published ---
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- A small real catalog: Menu Type -> Category (assigned to it) -> Food Item (tagged into both) ---
  await page.goto("/menu-catalog/menus");
  const menuName = `Wedding Menu ${suffix}`;
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("400");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const categoryName = `Mains ${suffix}`;
  await page.goto("/menu-catalog/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(categoryName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("checkbox", { name: categoryName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Event Type with that Menu assigned (Menu Selection scopes its catalog to this) ---
  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/events/new");
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events$/);

  // --- Customer submits the public intake form (brand-new cookie-less context, no login) ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const customerName = `Reyansh Kapoor ${suffix}`;
  await publicPage.goto(`/${slug}`);
  await publicPage.getByLabel("Your Name").fill(customerName);
  await publicPage.getByLabel("Email Address").fill(`customer-${suffix}@example.test`);
  await publicPage.getByRole("textbox", { name: "Phone Number" }).fill("9876500000");
  await publicPage.getByLabel("Event Date").fill("2026-12-20");
  await publicPage.getByLabel("Event Type").click();
  await publicPage.getByRole("option", { name: eventTypeName }).click();
  await publicPage.getByLabel("Number of Guests").fill("100");
  await publicPage.getByLabel("Event Time").click();
  await publicPage.getByRole("option", { name: "Dinner" }).click();
  await publicPage.getByLabel("Menu Preference").click();
  await publicPage.getByRole("option", { name: "Vegetarian — Pure veg menu" }).click();
  await publicPage.getByRole("button", { name: "Continue to Menu Selection" }).click();
  await expect(publicPage).toHaveURL(/\/menu-selection\/.+/);

  // --- Customer selects the item and approves & submits ---
  await expect(publicPage.getByText(itemName)).toBeVisible();
  await publicPage.getByLabel(`Quantity for ${itemName}`).fill("100");
  await publicPage.getByRole("button", { name: "Approve & Submit" }).click();
  await expect(publicPage.getByText("Thanks — your menu selection is submitted")).toBeVisible();
  await publicContext.close();

  // --- Admin: the Menu Approvals queue shows it, needing kitchen review ---
  await page.goto("/menu-approvals");
  await expect(page.getByText(customerName, { exact: true })).toBeVisible();
  await expect(page.getByText("Needs Kitchen Review")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page).toHaveURL(/\/menu-approvals\/.+/);

  // --- Kitchen reviews the real selected item, approves, then locks ---
  await expect(page.getByLabel(`Quantity for ${itemName}`)).toHaveValue("100");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("button", { name: "Lock Menu" })).toBeVisible();
  await page.getByRole("button", { name: "Lock Menu" }).click();
  await expect(page.getByText(/Locked on/)).toBeVisible();

  // --- Kitchen Dashboard: the freshly-locked menu starts Pending, and advances one stage at a time ---
  await page.goto("/kitchen-dashboard");
  const pendingColumn = page.locator('[data-stage="PENDING"]');
  await expect(pendingColumn.getByText(customerName, { exact: true })).toBeVisible();

  await pendingColumn.getByRole("button", { name: "Start Preparing" }).click();
  const preparingColumn = page.locator('[data-stage="PREPARING"]');
  await expect(preparingColumn.getByText(customerName, { exact: true })).toBeVisible();

  await preparingColumn.getByRole("button", { name: "Mark Ready" }).click();
  const readyColumn = page.locator('[data-stage="READY"]');
  await expect(readyColumn.getByText(customerName, { exact: true })).toBeVisible();

  await readyColumn.getByRole("button", { name: "Mark Completed" }).click();
  const completedColumn = page.locator('[data-stage="COMPLETED"]');
  await expect(completedColumn.getByText(customerName, { exact: true })).toBeVisible();
});

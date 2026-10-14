import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Purchasing workflow: a draft with only the supplier's items and no prices, Send via WhatsApp (opening it changes nothing; confirming marks it ordered once), filters. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function addItem(page: Page, name: string, category: string) {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(name);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: category }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(name)).toBeVisible();
}

test("draft order with the supplier's items only, WhatsApp opens without ordering, confirming orders it once", async ({ page, context }) => {
  test.setTimeout(150_000);
  const email = `e2e-po-whatsapp-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const [supplier, mutton, chicken, salt] = [`Meat Shop ${suffix}`, `Mutton ${suffix}`, `Chicken ${suffix}`, `Salt ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Po", lastName: "Whatsapp", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  for (const [name, category] of [[mutton, "Meat & Poultry"], [chicken, "Meat & Poultry"], [salt, "Spices & Masalas"]]) await addItem(page, name, category);

  // A supplier with a phone number that provides mutton and chicken (not salt)
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  const drawer = page.getByRole("dialog", { name: "New Supplier" });
  await drawer.getByLabel("Supplier Name").fill(supplier);
  await drawer.getByLabel("Phone", { exact: true }).fill("9876543210");
  for (const name of [mutton, chicken]) {
    await drawer.getByRole("button", { name: "Add a product" }).click();
    await page.getByRole("option", { name: new RegExp(name) }).click();
  }
  await drawer.getByRole("button", { name: "Create supplier" }).click();
  await expect(drawer).not.toBeVisible();

  // New order: no Expected on, no prices; only this supplier's items are offered
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.goto("/purchasing/new");
  await expect(page.getByLabel("Expected on")).toHaveCount(0);
  await expect(page.getByText("Choose a supplier to see the items they provide.")).toBeVisible();
  await page.getByLabel("Supplier", { exact: true }).click();
  await page.getByRole("option", { name: supplier }).click();
  await page.getByLabel("Item 1").click();
  await expect(page.getByRole("option", { name: salt })).toHaveCount(0);
  await expect(page.getByRole("option", { name: mutton })).toBeVisible();
  await page.getByRole("option", { name: mutton }).click();
  await page.getByLabel("Quantity 1").fill("33");
  await expect(page.getByLabel("Unit 1")).toHaveText("kg");
  await expect(page.getByLabel(/Unit cost/)).toHaveCount(0);
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item 2").click();
  await expect(page.getByRole("option", { name: chicken })).toBeVisible();
  await page.waitForTimeout(300); // let the list finish opening
  await page.getByRole("option", { name: chicken }).click();
  await page.getByLabel("Quantity 2").fill("10");

  // Validation: a missing quantity is refused before anything is saved
  await page.getByLabel("Quantity 2").fill("");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("quantity");
  await page.getByLabel("Quantity 2").fill("10");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-0001" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByText("Not yet priced")).toBeVisible();

  // Draft changed no stock
  await page.goto("/inventory");
  await expect(page.getByRole("row").filter({ hasText: mutton })).toContainText("0 kg");

  // The list: unpriced, no Expected column, and the filters
  await page.goto("/purchasing");
  await expect(page.getByRole("columnheader", { name: "Expected" })).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "PO-0001" });
  await expect(row).toContainText("Not yet priced");
  await expect(row).not.toContainText("₹0.00");
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "PO-0001" })).toHaveCount(1);
  await page.getByRole("button", { name: "Ordered", exact: true }).click();
  await expect(page.getByText("No purchase orders that are ordered.")).toBeVisible();

  // Send via WhatsApp: the link carries the message; opening it changes nothing
  await page.goto("/purchasing");
  await page.getByRole("link", { name: "PO-0001" }).click();
  for (const action of ["Edit", "Send via WhatsApp", "Cancel order", "Delete"]) await expect(page.getByRole("button", { name: action, exact: true })).toBeVisible();
  const link = await page.getByRole("button", { name: "Send via WhatsApp" }).evaluate((el) => (el as HTMLAnchorElement).href);
  expect(await page.getByRole("button", { name: "Send via WhatsApp" }).getAttribute("target")).toBe("_blank");
  expect(await page.getByRole("button", { name: "Send via WhatsApp" }).getAttribute("rel")).toContain("noopener");
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Send via WhatsApp" }).click()]);
  await popup.close();
  expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true);
  const text = decodeURIComponent(link.split("?text=")[1]);
  expect(text).toContain(`Hello ${supplier},`);
  expect(text).toContain("Purchase Order: PO-0001");
  expect(text).toContain(`• ${mutton} — 33 kg`);
  expect(text).toContain(`• ${chicken} — 10 kg`);
  expect(text).not.toMatch(/₹/);

  // The question appears; "Not yet" leaves it a draft
  const ask = page.getByRole("alertdialog", { name: "Have you sent this purchase order to the supplier?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Not yet" }).click();
  await page.reload();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  // Confirming moves it to Ordered; the draft-only actions are gone, Receive and Cancel remain
  await Promise.all([context.waitForEvent("page").then((p) => p.close()), page.getByRole("button", { name: "Send via WhatsApp" }).click()]);
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByText("Ordered", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send via WhatsApp" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Receive stock", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel order" })).toBeVisible();

  // Still no stock; the Ordered filter finds it
  await page.goto("/inventory");
  await expect(page.getByRole("row").filter({ hasText: mutton })).toContainText("0 kg");
  await page.goto("/purchasing?status=ORDERED");
  await expect(page.getByRole("row").filter({ hasText: "PO-0001" })).toHaveCount(1);

  // Cancelling an ordered order with nothing received works and keeps it read-only
  await page.getByRole("link", { name: "PO-0001" }).click();
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Receive stock" })).toHaveCount(0);
});

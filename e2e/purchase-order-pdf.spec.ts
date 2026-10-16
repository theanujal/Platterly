import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** Download PDF on the purchase order page: a real file with the order's details; downloading changes nothing and sends nothing. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("Download PDF saves the draft order as a PDF without changing its status or stock", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-po-pdf-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const [supplier, rice] = [`Rice Traders ${suffix}`, `Basmati ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Po", lastName: "Pdf", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(rice);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Grains & Cereals" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(rice)).toBeVisible();

  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  const drawer = page.getByRole("dialog", { name: "New Supplier" });
  await drawer.getByLabel("Supplier Name").fill(supplier);
  await drawer.getByLabel("Phone", { exact: true }).fill("9876543210");
  await drawer.getByRole("button", { name: "Add a product" }).click();
  await page.getByRole("option", { name: new RegExp(rice) }).click();
  await drawer.getByRole("button", { name: "Create supplier" }).click();
  await expect(drawer).not.toBeVisible();

  await page.goto("/purchasing/new");
  await page.getByLabel("Supplier", { exact: true }).click();
  await page.getByRole("option", { name: supplier }).click();
  await page.getByLabel("Item 1").click();
  await page.getByRole("option", { name: rice }).click();
  await page.getByLabel("Quantity 1").fill("25");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-0001" })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toBe("PO-0001.pdf");
  const bytes = readFileSync(await download.path());
  const pdf = bytes.toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  for (const needle of ["Purchase Order", "PO-0001", "Draft", supplier, rice, "25 kg", "Not yet priced", "Powered by", "Platterly"]) expect(pdf, needle).toContain(needle);
  expect(pdf).not.toMatch(/Rs\. ?0\.00/);

  // The same file from the Purchasing table, without opening the order
  await page.goto("/purchasing");
  const [fromList] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF for PO-0001" }).click()]);
  expect(fromList.suggestedFilename()).toBe("PO-0001.pdf");
  const listPdf = readFileSync(await fromList.path()).toString("latin1");
  for (const needle of ["PO-0001", supplier, rice, "25 kg"]) expect(listPdf, needle).toContain(needle);
  await expect(page).toHaveURL(/\/purchasing$/); // the row click did not also open the order
  await page.getByRole("link", { name: "PO-0001" }).click();
  await expect(page).toHaveURL(/\/purchasing\/[^/]+$/); // reloading before the navigation lands would reload the list

  // Nothing changed: still a draft (not sent to the supplier), and no stock was added
  await page.reload();
  await expect(page.locator("[data-slot=badge]").filter({ hasText: /^Draft$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send via WhatsApp" })).toBeVisible();
  await page.goto("/inventory");
  await expect(page.getByRole("row").filter({ hasText: rice })).toContainText("0 kg");
});

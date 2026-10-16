import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, lockSeededSelection, seedApprovedOrderForShare, seedMealPlan } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** The kitchen order's Print / Download PDF is made in the kitchen's own sheet format (AJ, 2026-10-17): one page per meal. */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the kitchen order PDF has the kitchen's sheet layout, one page per meal", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-ksheet-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Kit", lastName: "Chen", phone: "9800000086" });
  const { orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION", multi: true });
  await seedMealPlan(orderId);
  const selectionId = await lockSeededSelection(orderId);

  const inline = await page.request.get(`/kitchen-dashboard/${selectionId}/pdf`);
  expect(inline.status()).toBe(200);
  expect(inline.headers()["content-type"]).toBe("application/pdf");
  expect(inline.headers()["content-disposition"]).toMatch(/^inline;/);
  const body = (await inline.body()).toString("latin1");
  expect(body.startsWith("%PDF")).toBe(true);
  for (const word of ["Booking Date", "Food Pickup from Kitchen", "Total Guests", "Selected Menu", "Service Also Include", "Please Note", "DINNER", "LUNCH", "Paneer Tikka", "Dal Makhani", "Page 2 of 2"]) expect(body).toContain(word);

  for (const word of ["Contact Number", "Advance Paid", "Pax Price", "Transportation", "GST"]) expect(body).not.toContain(word);

  const download = await page.request.get(`/kitchen-dashboard/${selectionId}/pdf?download=1`);
  expect(download.headers()["content-disposition"]).toMatch(/^attachment; filename="kitchen-ORD-\d+\.pdf"$/);
});

test("the Service Also Include and Please Note texts come from Settings -> Kitchen Rules", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-ksheet2-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Kit", lastName: "Texts", phone: "9800000087" });
  const { orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION" });
  await seedMealPlan(orderId);
  const selectionId = await lockSeededSelection(orderId);

  // Until the kitchen writes its own, the default wording is printed.
  expect((await (await page.request.get(`/kitchen-dashboard/${selectionId}/pdf`)).body()).toString("latin1")).toContain("Bisleri");

  await page.goto("/settings/kitchen/kitchen-rules");
  await page.getByRole("button", { name: "Edit Texts" }).click();
  await page.getByLabel("Service Also Include").fill("1. Our own service point\nSecond own point");
  await page.getByLabel("Please Note").fill("");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Our own service point")).toBeVisible();
  await expect(page.getByText("Not set (left off the sheet)")).toBeVisible();

  const body = (await (await page.request.get(`/kitchen-dashboard/${selectionId}/pdf`)).body()).toString("latin1");
  expect(body).toContain("Our own service point");
  expect(body).toContain("Second own point");
  expect(body).not.toContain("Bisleri");
  expect(body).not.toContain("Please Note");
});

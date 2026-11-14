import { expect, test } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/** The Account's Invoices and Subscriptions pages (Subscriptions replaced Payments, AJ 2026-11-14) (read-only, from Ops). A person with a business is covered by the data-layer tests against real Ops; here, the guards and the no-business path. */
const ACCOUNT = "http://account.localhost:3300";
const STORE = "http://store.localhost:3300";

test.describe("Account billing pages", () => {
  test("the billing routes refuse a signed-out caller and every host but the Account", async ({ request }) => {
    expect((await request.get(`${ACCOUNT}/api/account/billing`)).status()).toBe(401);
    expect((await request.get(`${ACCOUNT}/api/account/invoices/pay_abc?product=caterly`)).status()).toBe(401);
    expect((await request.get(`${STORE}/api/account/billing`)).status()).toBe(404);
    expect((await request.get(`${STORE}/api/account/invoices/pay_abc?product=caterly`)).status()).toBe(404);
  });

  test("Invoices and Subscriptions are signed-in pages in the menu, and a person with no business is told there is nothing to show", async ({ page }) => {
    await page.goto(`${ACCOUNT}/invoices`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await registerAndSignIn(page, newEmail(), `${ACCOUNT}/invoices`, "No Billing");
    await expect(page.getByRole("heading", { name: "Invoices", level: 1 })).toBeVisible();
    await expect(page.getByText("You have not set up a business yet, so there is no billing to show.")).toBeVisible();
    await page.goto(`${ACCOUNT}/subscriptions`);
    await expect(page.getByRole("heading", { name: "Subscriptions", level: 1 })).toBeVisible();
    await expect(page.getByText("You have not set up a business yet, so there is no billing to show.")).toBeVisible();
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Invoices" })).toHaveAttribute("href", "/invoices");
    await expect(nav.getByRole("link", { name: "Subscriptions" })).toHaveAttribute("href", "/subscriptions");
    await expect(nav.getByRole("link", { name: "Payments" })).toHaveCount(0);
    // The old Payments address still works and lands on Subscriptions.
    await page.goto(`${ACCOUNT}/payments`);
    await expect(page).toHaveURL(/\/subscriptions$/);
    // A payment id from nowhere is a 404 for a person with no business, never someone's invoice.
    expect((await page.request.get(`${ACCOUNT}/api/account/invoices/pay_abc?product=caterly`)).status()).toBe(404);
  });
});

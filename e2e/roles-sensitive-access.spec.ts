import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, lockSeededSelection, seedApprovedOrderForShare, seedMealPlan, seedOrderForBilling, setMemberRole, setOrderStatus, setSensitiveGrants } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Roles & Permissions, sensitive data (AJ, 2026-10-17): prices, payments and commercial documents are separate from module
 * access. The Admin sees them, the other roles do not until the Admin grants the key, and a revoke takes effect on the next
 * request. Checks the page, the PDFs and the exports, not just the hidden button.
 */
const emails: string[] = [];
test.afterEach(async () => {
  const email = emails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("Admin sees prices; Manager does not until a sensitive key is granted, and a revoke takes effect", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-sensitive-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email, { firstName: "Sens", lastName: "Itive", phone: "9800000071" });
  const { orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION" });

  // Admin (owner): amounts on the list, commercial PDF gate passes (an unknown invoice is 404, not 403), export allowed.
  await page.goto("/orders");
  await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
  expect((await page.request.get("/invoices/does-not-exist/pdf")).status()).toBe(404);
  expect((await page.request.get("/reports/export?tab=sales")).status()).toBe(200);

  // Manager: operational access, but no price, no commercial documents.
  await setMemberRole(email, "manager");
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Amount" })).toHaveCount(0);
  expect((await page.request.get("/invoices/does-not-exist/pdf")).status()).toBe(403);
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText(/Grand Total/)).toHaveCount(0);

  // Granting orderPrices and commercialDocuments shows them on the next request.
  await setSensitiveGrants(email, "manager", ["orderPrices", "commercialDocuments"]);
  await page.goto("/orders");
  await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
  expect((await page.request.get("/invoices/does-not-exist/pdf")).status()).toBe(404);

  // Revoking (an override that no longer lists the key) takes them away again.
  await setSensitiveGrants(email, "manager", []);
  await page.goto("/orders");
  await expect(page.getByRole("columnheader", { name: "Amount" })).toHaveCount(0);
  expect((await page.request.get("/invoices/does-not-exist/pdf")).status()).toBe(403);
});

test("Kitchen Team moves the cooking stage and gets the kitchen sheet PDF, but no commercial PDF, export or price", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-kitchensens-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email, { firstName: "Kit", lastName: "Sens", phone: "9800000072" });
  const { orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION" });
  await seedMealPlan(orderId);
  const selectionId = await lockSeededSelection(orderId);
  await setMemberRole(email, "kitchen");

  // Cooking stage: the Kitchen Team moves it with no Orders access, and it persists.
  await page.goto(`/kitchen-dashboard/${selectionId}`);
  await page.getByRole("button", { name: "Mark as In Preparation" }).click();
  await expect(page.getByRole("button", { name: "Mark as Ready" })).toBeVisible({ timeout: 30_000 }); // the first call compiles the action in dev
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark as Ready" })).toBeVisible();

  const sheet = await page.request.get(`/kitchen-dashboard/${selectionId}/pdf`);
  expect(sheet.status()).toBe(200);
  expect(sheet.headers()["content-type"]).toBe("application/pdf");

  expect((await page.request.get("/invoices/does-not-exist/pdf")).status()).toBe(403);
  expect((await page.request.get("/purchasing/does-not-exist/pdf")).status()).toBe(403);
  for (const path of ["/reports/export?tab=sales", "/expenses/export", "/profitability/export", "/audit-log/export"]) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }

  // The order opens read-only with no price text in the page source.
  const html = await (await page.request.get(`/orders/${orderId}`)).text();
  expect(html).not.toMatch(/Grand Total|Order Amount|Advance Paid/);
});

/**
 * The check that matters is on what the server sends, not what the page hides: the raw HTML (which carries the data handed to
 * client components) must not hold the figure at all for a role without the key, on the same signed-in session, and a grant or
 * revoke must show on the very next request.
 */
test("a protected amount never reaches the browser for a role without the key, and grant/revoke apply to the next request", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-payload-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email, { firstName: "Pay", lastName: "Load", phone: "9800000073" });
  const { orderId } = await seedOrderForBilling(email, 73419);
  await setOrderStatus(orderId, "APPROVED"); // an approved order with its balance owed is what the dashboard's money cards count
  // Digit boundaries, so the figure cannot match inside a phone number, id or hash.
  const AMOUNT = /(?<!\d)73,?419(?!\d)/;
  /** The text around the first match, or "" when the amount is absent (so a failure shows where it leaked). */
  const leak = (body: string) => { const at = body.search(AMOUNT); return at < 0 ? "" : body.slice(Math.max(0, at - 120), at + 60); };
  const pages = ["/orders", `/orders/${orderId}`, "/dashboard", "/overdue-payments", "/profitability"];
  const bodies = async () => Object.fromEntries(await Promise.all(pages.map(async (path) => [path, await (await page.request.get(path)).text()])));

  // Admin: the amount is there (positive control, so the absence checks below mean something).
  let html = await bodies();
  expect(html["/orders"]).toMatch(AMOUNT);
  expect(html[`/orders/${orderId}`]).toMatch(AMOUNT);
  expect(html["/dashboard"]).toMatch(AMOUNT);

  // Manager, same session: not one of these responses holds the amount, wherever it is nested in the page data.
  await setMemberRole(email, "manager");
  html = await bodies();
  for (const path of pages) expect(leak(html[path]), path).toBe("");

  // orderPrices alone brings it back on the orders pages, but not the payment views or the dashboard money.
  await setSensitiveGrants(email, "manager", ["orderPrices"]);
  html = await bodies();
  expect(html["/orders"]).toMatch(AMOUNT);
  expect(html[`/orders/${orderId}`]).toMatch(AMOUNT);
  expect(html["/overdue-payments"]).not.toMatch(AMOUNT);
  expect(html["/profitability"]).not.toMatch(AMOUNT);

  // Revoked: gone again on the next request.
  await setSensitiveGrants(email, "manager", []);
  html = await bodies();
  for (const path of pages) expect(leak(html[path]), path).toBe("");
});

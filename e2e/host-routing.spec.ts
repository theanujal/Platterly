import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Host routing (AJ, 2026-10-03): each product lives on its own host and nothing leaks onto another.
 *   catering.<root>/  shows the kitchen sign-in / sign-up straight away (the URL stays "/")
 *   ops.<root>        is Platterly Ops (its own app, apps/ops); this app serves nothing there except /api/health
 *   anything else     (the bare host, the apex, an IP) serves no page and no API except /api/health
 */
const CATERING = process.env.PW_BASE_URL ?? "http://catering.localhost:3000";
const OPS = process.env.PW_OPS_URL ?? "http://ops.localhost:3000";
const BARE = process.env.PW_BARE_URL ?? "http://localhost:3000";

test("the catering root shows the kitchen sign-in directly, without redirecting", async ({ page }) => {
  const response = await page.goto(`${CATERING}/`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`^${CATERING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`));
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
  // It is the sign-in page, so it is not offered to search engines yet and carries no template text
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByText("To get started, edit the")).toHaveCount(0);
  // The old address redirects to the root, keeping any query
  const old = await page.request.get(`${CATERING}/kitchenlogin?next=%2Fdashboard`, { maxRedirects: 0 });
  expect(old.status()).toBe(307);
  expect(old.headers()["location"]).toMatch(/^(https?:\/\/catering\.[^/]+)?\/\?next=%2Fdashboard$/);
  await page.goto(`${CATERING}/kitchenlogin`);
  await expect(page).toHaveURL(new RegExp(`^${CATERING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/$`));
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  // The wizard keeps its own path
  const wizard = await page.request.get(`${CATERING}/kitchenlogin/onboarding`, { maxRedirects: 0 });
  expect(wizard.status()).not.toBe(404);
});

test("a signed-in caterer who opens the catering root lands on the Dashboard", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-root-${Date.now()}@example.test`;
  try {
    await signUpCaterer(page, email, { firstName: "Root", lastName: "Tester", phone: "9800000085" });
    await page.goto(`${CATERING}/`);
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await cleanupOnboardingTestUser(email);
  }
});

test("this app serves no page on the ops host: the platform admin is Platterly Ops, a separate app", async ({ page }) => {
  for (const path of ["/", "/kitchenlogin", "/super", "/super/dashboard", "/dashboard"]) {
    expect((await page.request.get(`${OPS}${path}`, { headers: { "sec-fetch-dest": "document" } })).status(), path).toBe(404);
  }
});

test("there is no Super Admin on the catering host either", async ({ page }) => {
  for (const path of ["/super", "/super/dashboard", "/super/tenants", "/super/reports"]) {
    expect((await page.request.get(`${CATERING}${path}`, { headers: { "sec-fetch-dest": "document" } })).status(), path).toBe(404);
  }
});

test("a bare or unknown host serves no page and no API except the health check", async ({ page }) => {
  // Pages
  expect((await page.request.get(`${BARE}/`, { headers: { "sec-fetch-dest": "document" } })).status()).toBe(404);
  expect((await page.request.get(`${BARE}/kitchenlogin`, { headers: { "sec-fetch-dest": "document" } })).status()).toBe(404);
  // APIs, asked the way a script or a payment provider would (no browser headers)
  expect((await page.request.get(`${BARE}/api/auth/get-session`)).status()).toBe(404);
  expect((await page.request.post(`${BARE}/api/webhooks/razorpay/some-org`, { data: "{}" })).status()).toBe(404);
  expect((await page.request.get(`${BARE}/api/health`)).status()).toBe(200);
  // A look-alike host is the same as a bare one
  expect((await page.request.get(`${BARE}/api/auth/get-session`, { headers: { "x-forwarded-host": "catering.localhost.evil.test" } })).status()).toBe(404);
});

test("the APIs answer on their own hosts", async ({ page }) => {
  expect((await page.request.get(`${CATERING}/api/health`)).status()).toBe(200);
  expect((await page.request.get(`${CATERING}/api/auth/get-session`)).status()).toBe(200);
  // The ops host belongs to Platterly Ops: this app answers only the uptime check there.
  expect((await page.request.get(`${OPS}/api/auth/get-session`)).status()).toBe(404);
  expect((await page.request.get(`${OPS}/api/health`)).status()).toBe(200);
  // The Razorpay webhook belongs to the catering host only: unknown kitchen, so it refuses, but it is routed
  expect((await page.request.post(`${CATERING}/api/webhooks/razorpay/no-such-kitchen`, { data: "{}" })).status()).not.toBe(404);
  expect((await page.request.post(`${OPS}/api/webhooks/razorpay/no-such-kitchen`, { data: "{}" })).status()).toBe(404);
});

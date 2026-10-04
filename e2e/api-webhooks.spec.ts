import { test, expect, request as playwrightRequest } from "@playwright/test";
import { cleanupOnboardingTestUser, setMemberRole } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 25: the owner makes an API key in Settings and uses it from a program that has no session (a clean request
 * context, no cookies); the permissions are enforced, a revoked key stops working at once, and the webhook screen
 * refuses addresses that point inside a private network.
 */
const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("an API key made in Settings works from outside, only for what it may do, and stops when revoked", async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const email = `e2e-api-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Api", lastName: "Owner", phone: "9800000033" });

  await page.goto("/settings/integration/api-webhooks");
  await expect(page.getByRole("heading", { name: "API & Webhooks" })).toBeVisible();
  await expect(page.getByTestId("api-base-url")).toContainText("/api/v1");
  await expect(page.getByText("No API keys yet.")).toBeVisible();

  // Create a key with three permissions.
  await page.getByLabel("Name", { exact: true }).fill("Website");
  for (const scope of ["menus:read", "customers:read", "customers:write"]) await page.getByRole("checkbox", { name: new RegExp(scope) }).click();
  await page.getByRole("button", { name: "Create API Key" }).click();
  const key = (await page.getByTestId("new-api-key").textContent())!.trim();
  expect(key).toMatch(/^plt_live_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  await page.getByRole("button", { name: "I have saved it" }).click();
  await expect(page.getByTestId("new-api-key")).toHaveCount(0);
  // The key is never shown again: the list holds only its prefix.
  const row = page.getByTestId("api-key-row").first();
  await expect(row).toContainText("Website");
  await expect(row).toContainText("Active");
  await expect(row).toContainText(key.split("_")[2]);
  expect(await page.content()).not.toContain(key);

  // A program with no session: a clean context that sends only the key.
  const api = await playwrightRequest.newContext({ baseURL });
  const auth = { Authorization: `Bearer ${key}` };
  expect((await api.get("/api/v1/kitchen")).status()).toBe(401);
  const me = await api.get("/api/v1/kitchen", { headers: auth });
  expect(me.status()).toBe(200);
  expect((await me.json()).data.api_key).toEqual({ name: "Website", scopes: ["menus:read", "customers:read", "customers:write"] });
  expect(me.headers()["x-ratelimit-limit"]).toBe("120");
  expect((await api.get("/api/v1/menus", { headers: auth })).status()).toBe(200);
  const denied = await api.get("/api/v1/orders", { headers: auth });
  expect([denied.status(), (await denied.json()).error.code]).toEqual([403, "INSUFFICIENT_SCOPE"]);
  const made = await api.post("/api/v1/customers", { headers: { ...auth, "Idempotency-Key": `e2e-${Date.now()}-1` }, data: { name: "Via API", phone: "+919876543210" } });
  expect(made.status()).toBe(201);
  const id = (await made.json()).data.id as string;
  expect((await api.get(`/api/v1/customers/${id}`, { headers: auth })).status()).toBe(200);
  // The customer is really in the kitchen.
  await page.goto("/customers");
  await expect(page.getByText("Via API").first()).toBeVisible();
  expect((await (await api.get("/api/v1/openapi.json")).json()).openapi).toBe("3.0.3");

  // Revoke it: the very next call is refused.
  await page.goto("/settings/integration/api-webhooks");
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(page.getByTestId("api-key-row").first()).toContainText("Revoked");
  const after = await api.get("/api/v1/kitchen", { headers: auth });
  expect([after.status(), (await after.json()).error.code]).toEqual([401, "API_KEY_REVOKED"]);
  await api.dispose();
});

test("webhooks: a private address is refused, a public one is added with its secret shown once, and it can be switched off and deleted", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-hook-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Hook", lastName: "Owner", phone: "9800000034" });
  await page.goto("/settings/integration/api-webhooks");

  await page.getByLabel("Web address").fill("https://localhost/hook");
  await page.getByRole("button", { name: "Add Webhook" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("private network");
  await page.getByLabel("Web address").fill("http://example.com/hook");
  await page.getByRole("button", { name: "Add Webhook" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("https://");

  await page.getByLabel("Web address").fill("https://example.com/hooks/platterly");
  await page.getByLabel("Note (optional)").fill("Accounts tool");
  await page.getByRole("button", { name: "Add Webhook" }).click();
  const secret = (await page.getByTestId("new-webhook-secret").textContent())!.trim();
  expect(secret).toMatch(/^whsec_/);
  await page.getByRole("button", { name: "I have saved it" }).click();
  const row = page.getByTestId("webhook-row");
  await expect(row).toContainText("https://example.com/hooks/platterly");
  await expect(row).toContainText("Accounts tool");
  await expect(row).toContainText("10 of 10 events");
  expect(await page.content()).not.toContain(secret);
  await expect(page.getByText("Nothing has been sent yet.")).toBeVisible();

  await page.getByRole("switch", { name: /Turn .* on or off/ }).click();
  await expect(row.getByText("Off", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Delete https:\/\/example.com/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No webhooks yet.")).toBeVisible();
});

test("only the owner can make keys; a manager sees the screen read-only and is refused at the action", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-apiro-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Read", lastName: "Only", phone: "9800000035" });
  await setMemberRole(email, "manager");
  const res = await page.goto("/settings/integration/api-webhooks");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Only the owner can create or revoke API keys.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create API Key" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Webhook" })).toHaveCount(0);
  await setMemberRole(email, "kitchen");
  expect((await page.goto("/settings/integration/api-webhooks"))?.status()).toBe(403);
});

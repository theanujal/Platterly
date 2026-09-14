import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { cleanupTenantBySlug } from "./db";

/**
 * Chunk 3 — exercises the real /super login UI with the persistent Super
 * Admin account (created for AJ's own manual use, not a disposable test
 * user — these specs sign in and read pages, they never create or delete
 * an account). Credentials come from the environment, never hardcoded —
 * this is a real account, not a throwaway test fixture.
 */
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

async function signInAsSuperAdmin(page: Page) {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env to run this spec.");
  }
  await page.goto("/super");
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(SUPER_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/super\/dashboard$/);
}

test("Super Admin can sign in via the UI and reach the dashboard", async ({ page }) => {
  await page.goto("/super");
  await expect(page.getByRole("heading", { name: "Super Admin" })).toBeVisible();

  await signInAsSuperAdmin(page);

  await expect(page.getByRole("heading", { name: "Welcome, AJ" })).toBeVisible();
  await expect(page.getByText("Total caterers")).toBeVisible();

  await page.screenshot({ path: "e2e/.artifacts/super-admin-dashboard.png", fullPage: true });
});

test("Tenants and Plans pages render their 'New' link-button with no Base UI console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await signInAsSuperAdmin(page);

  // Base UI assigns role="button" here (ARIA compensation for a styled
  // <a> acting as a button, per the nativeButton={false} fix) even though
  // the underlying element is a Next.js <Link>.
  await page.goto("/super/tenants");
  await expect(page.getByRole("button", { name: "New Caterer" })).toBeVisible();

  await page.goto("/super/plans");
  await expect(page.getByRole("button", { name: "New Plan" })).toBeVisible();

  const nativeButtonWarnings = consoleErrors.filter((text) => text.includes("nativeButton"));
  expect(nativeButtonWarnings).toEqual([]);
});

test("clicking 'New Caterer' actually navigates to the create-tenant page", async ({ page }) => {
  await signInAsSuperAdmin(page);

  await page.goto("/super/tenants");
  await page.getByRole("button", { name: "New Caterer" }).click();
  await expect(page).toHaveURL(/\/super\/tenants\/new$/);
  await expect(page.getByRole("heading", { name: "New Caterer" })).toBeVisible();
});

test("creating a tenant with a separate owner first/last name renders the joined name, not blank", async ({ page }) => {
  // Chunk 6 correction (AJ, 2026-09-14) — Owner Name showed "—" for every
  // self-serve signup because nothing wrote to it; this exercises the
  // Super Admin path directly, the one place `ownerFirstName`/`ownerLastName`
  // were always settable, to confirm the field-split itself renders correctly.
  // 8-char prefix + 10-digit suffix stays under the slug field's 20-char
  // maxLength — a full Date.now() here previously got silently truncated by
  // the input, so cleanup queried for a slug that was never actually saved.
  const slug = `e2e-own-${Date.now().toString().slice(-10)}`;
  try {
    await signInAsSuperAdmin(page);

    await page.goto("/super/tenants/new");
    await page.getByLabel("Business name").fill("Owner Name Test Co");
    await page.getByLabel("Storefront slug").fill(slug);
    await page.getByLabel("Owner first name").fill("Asha");
    await page.getByLabel("Owner last name").fill("Rao");
    await page.getByRole("button", { name: "Create caterer" }).click();

    await expect(page).toHaveURL(/\/super\/tenants$/);
    const row = page.getByRole("row", { name: /Owner Name Test Co/ });
    await expect(row.getByRole("cell", { name: "Asha Rao" })).toBeVisible();

    await row.getByRole("link", { name: "Owner Name Test Co" }).click();
    await expect(page.getByText("Asha Rao")).toBeVisible();
  } finally {
    await cleanupTenantBySlug(slug);
  }
});

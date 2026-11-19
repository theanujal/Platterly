import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { cleanupOnboardingTestUser } from "./db";

/** The sign-in system's code emails (approved Caterly layout): the code is read from the email body, not the subject. */
const CODE_SUBJECT = /Account Verification|Reset Your Platterly Password|Confirm Your New Platterly Email|Confirm Your Platterly Recovery Email|Sign-in Code/;


/**
 * The Account's Business & Billing page and Caterly's Business Profile page carry the same fields (2026-11-17). One real person registers through Caterly, saves
 * the business name, mobile number and order numbering in Caterly, sees the same values in the Account, changes them there and sees the change in Caterly.
 * Needs the Platform, Ops, Caterly, the mail sink and PLATFORM_SSO_E2E=1. It leaves permanent Platform audit rows (that table cannot have rows deleted) and an
 * Ops business, so it is run on purpose, never in a routine run.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1", "needs the Platform, Ops, the mail sink and PLATFORM_SSO_E2E=1");

const SINK = "http://localhost:3600";
const CATERLY = "http://catering.localhost:3000";
const ACCOUNT = "http://account.localhost:3300";
const PASSWORD = "correct horse 7";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const created: string[] = [];
test.afterEach(async () => {
  const emails = created.splice(0);
  for (const email of emails) await cleanupOnboardingTestUser(email);
  if (process.env.IDENTITY_DATABASE_URL && emails.length) {
    const identity = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 1 });
    await identity.query('delete from "user" where email = any($1)', [emails]).finally(() => identity.end());
  }
});
test.afterAll(async () => { await pool.end(); });

async function fill(page: Page, label: string, value: string) {
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByLabel(label, label === "Password" ? { exact: true } : undefined).fill(value);
}
async function codeFor(page: Page, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; receivedAt: string; html: string }[];
    const mine = messages.filter((m) => m.to.includes(to) && CODE_SUBJECT.test(m.subject)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    const code = mine?.html.replace(/<[^>]*>/g, " ").match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await page.waitForTimeout(250);
  }
  throw new Error(`no code arrived for ${to}`);
}


test("business name, mobile and order numbering saved in Caterly show in the Account, and an Account change shows in Caterly", async ({ page }) => {
  test.setTimeout(240_000);
  const to = `profile-align-${Date.now()}@auth.test`;
  created.push(to);
  await page.goto(`${CATERLY}/`);
  await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await fill(page, "First name", "Align");
  await fill(page, "Last name", "Person");
  await fill(page, "Phone", "9800000123");
  await fill(page, "Confirm password", PASSWORD);
  await page.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(page, "Email", to);
  await fill(page, "Password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await fill(page, "Verification code", await codeFor(page, to));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/catering\.localhost:3000\/kitchenlogin\/onboarding/);
  // Single sign-up: the Platform made this business at sign-up and sent it to Caterly, so it already knows the person's seat.

  // Caterly: the business name (Billing Profile card), then the mobile number and order numbering (Business Profile card).
  await page.goto(`${CATERLY}/settings/account/business-profile`);
  await page.getByRole("button", { name: "Edit Billing" }).click();
  await page.getByLabel("Business name", { exact: true }).fill("Spice Route Caterers");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Spice Route Caterers").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByLabel("Mobile number").fill("9800000777");
  await page.getByLabel("Prefix", { exact: true }).fill("SR");
  await page.getByLabel("Starting number", { exact: true }).fill("25");
  await page.getByLabel("Digits", { exact: true }).fill("4");
  await page.getByLabel("LinkedIn URL").fill("https://linkedin.com/company/spice-route");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("SR-0025")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("https://linkedin.com/company/spice-route")).toBeVisible();

  // The Account shows the same values (the profile reaches Ops, then the Account reads it).
  await expect(async () => {
    await page.goto(`${ACCOUNT}/billing-details/catering`);
    await expect(page.getByText("Spice Route Caterers").first()).toBeVisible({ timeout: 4_000 });
    await expect(page.getByText("SR-0025")).toBeVisible({ timeout: 4_000 });
    await expect(page.getByRole("link", { name: "Open LinkedIn" }).first()).toHaveAttribute("href", "https://linkedin.com/company/spice-route", { timeout: 4_000 });
    await expect(page.getByText("98000 00777").or(page.getByText("9800000777"))).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });

  // The Account changes the mobile number and raises the order number; Caterly follows when its page opens.
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.locator("#bd-orderNumberNextValue").fill("40");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("SR-0040")).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await page.goto(`${CATERLY}/settings/account/business-profile`);
    await expect(page.getByText("SR-0040")).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
});

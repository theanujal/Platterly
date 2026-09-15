import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, cleanupInviteeUser, getPendingInvitationId, getOrganizationNameForUser } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 5 Group 5.2 — proves the invite/accept flow's real risk: that a
 * signup by an invited email joins the INVITER's existing organization
 * (via the `provisionTenantForNewUser` fix), not a fresh one of their own.
 */

const cleanupOwnerEmails: string[] = [];
const cleanupInviteeEmails: string[] = [];

test.afterEach(async () => {
  const inviteeEmail = cleanupInviteeEmails.pop();
  if (inviteeEmail) await cleanupInviteeUser(inviteeEmail);
  const ownerEmail = cleanupOwnerEmails.pop();
  if (ownerEmail) await cleanupOnboardingTestUser(ownerEmail);
});

// No `closeDbPool()` here — see kitchenlogin.spec.ts's comment: db.ts's pool
// is a shared module singleton across every spec file in this worker
// process, and closing it from any one file's `afterAll` breaks every
// other file that runs afterward.

test("inviting a teammate, accepting via signup, joins the SAME organization, and disabling locks them out", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const ownerEmail = `e2e-owner-${Date.now()}@example.test`;
  const staffEmail = `e2e-staff-${Date.now()}@example.test`;
  cleanupOwnerEmails.push(ownerEmail);
  cleanupInviteeEmails.push(staffEmail);
  const businessName = "Team Test HQ";

  // --- Owner signs up and completes onboarding ---
  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Owner");
  await page.getByLabel("Last name").fill("Person");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, ownerEmail);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);

  await page.getByLabel("Company / business name").fill(businessName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Every Contact & Address field is now mandatory (AJ, 2026-09-16).
  await page.getByLabel("Street address").fill("221B Baker Street");
  await page.getByLabel("City").fill("Mumbai");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("ZIP code").fill("400001");
  await page.getByLabel("Country", { exact: true }).fill("India");
  await page.getByLabel("Mobile number").fill("9876543210");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Complete Setup" }).click();
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding\/complete$/);
  await expect(page.getByText("Your Platterly account is ready!")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Take me to my Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Owner invites a staff member ---
  await page.goto("/settings/team");
  await page.getByRole("button", { name: "Invite" }).click();
  const inviteDialog = page.getByRole("dialog");
  await inviteDialog.getByLabel("Email").fill(staffEmail);
  // Role select already defaults to "Staff" — leave as-is.
  await inviteDialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(staffEmail)).toBeVisible();

  const invitationId = await getPendingInvitationId(staffEmail);
  expect(invitationId).not.toBeNull();

  // --- Invitee accepts via a fresh, unauthenticated browser context ---
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(`/invitations/${invitationId}/accept`);

  await expect(inviteePage.getByRole("heading", { name: "Create your account" })).toBeVisible();
  const emailField = inviteePage.getByLabel("Email");
  await expect(emailField).toHaveValue(staffEmail);
  await expect(emailField).toBeDisabled();

  await inviteePage.getByLabel("First name").fill("Staff");
  await inviteePage.getByLabel("Last name").fill("Person");
  await inviteePage.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await inviteePage.getByLabel("Confirm password").fill("correct-horse-battery");
  await inviteePage.getByLabel("I accept the Terms of Service and Privacy Policy").check();
  await inviteePage.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(inviteePage, staffEmail);

  // Must return to the invitation's own accept page, NOT the onboarding wizard.
  await expect(inviteePage).toHaveURL(new RegExp(`/invitations/${invitationId}/accept$`));
  await expect(inviteePage.getByRole("heading", { name: `Join ${businessName}` })).toBeVisible();

  await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(inviteePage).toHaveURL(/\/dashboard$/);
  // A brand-new org has never claimed a custom link, so the custom-link
  // popup auto-opens and (correctly) marks the rest of the page aria-hidden
  // while open — dismiss it before checking content behind it.
  const inviteeDialog = inviteePage.getByRole("dialog", { name: "Claim your custom link" });
  if (await inviteeDialog.isVisible().catch(() => false)) {
    await inviteePage.keyboard.press("Escape");
  }
  // Dashboard welcome heading greets the signed-in person by name (Staff
  // Person, filled in above), not the business name — AJ's explicit ask,
  // 2026-09-16.
  await expect(inviteePage.getByRole("heading", { name: "Welcome back, Staff Person" })).toBeVisible();

  // The critical proof: same organization, not a stray new one.
  const ownerOrgName = await getOrganizationNameForUser(ownerEmail);
  const inviteeOrgName = await getOrganizationNameForUser(staffEmail);
  expect(inviteeOrgName).toBe(ownerOrgName);
  expect(inviteeOrgName).toBe(businessName);

  // --- Owner sees the new member and disables them ---
  await page.goto("/settings/team");
  await expect(page.getByRole("cell", { name: "Staff Person" })).toBeVisible();
  const staffRow = page.getByRole("row", { name: /Staff Person/ });
  await staffRow.getByRole("button", { name: "Disable" }).click();
  await page.getByRole("button", { name: "Disable", exact: true }).last().click();
  await expect(staffRow.getByText("Disabled")).toBeVisible();

  // --- Disabled invitee is locked out on their next request ---
  await inviteePage.reload();
  await expect(inviteePage.getByRole("heading", { name: "Welcome back, Staff Person" })).not.toBeVisible();

  await inviteeContext.close();
});

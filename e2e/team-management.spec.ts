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
  await page.getByLabel("Phone", { exact: true }).fill("9800000099");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
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
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Complete Setup" }).click();
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding\/complete$/);
  // getByRole("heading", ...), not getByText (AJ, 2026-09-19) — Next.js's
  // #__next-route-announcer__ a11y live-region briefly mirrors this exact
  // text after the client-side redirect, so a bare getByText intermittently
  // strict-mode-fails against 2 elements. This is the 3rd occurrence of the
  // same flake (ISSUE-LOG.md) — fixed at the source this time instead of
  // just retrying.
  await expect(page.getByRole("heading", { name: "Your Platterly account is ready!" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Take me to my Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Owner invites a staff member ---
  await page.goto("/settings/team");
  await expect(page.getByText("Team members: 1", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Invite Member" }).click();
  await page.getByLabel("Email Address").fill(staffEmail);
  // Role select already defaults to "Staff" — its card lists what Staff can do.
  await expect(page.getByText("Permissions included:")).toBeVisible();
  await expect(page.getByText("Invitations expire after 48 hours.")).toBeVisible();
  await page.getByRole("button", { name: "Send Invitation" }).click();
  // A successful invite lands on the Pending Invitations tab, expiring in 48 hours.
  await expect(page.getByRole("tab", { name: /Pending Invitations/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(staffEmail)).toBeVisible();
  await expect(page.getByText(/Expires in (47|48)h/)).toBeVisible();

  // Resend keeps it to one row; Cancel removes only the invitation it's on.
  const extraEmail = `e2e-extra-${Date.now()}@example.test`;
  await page.getByRole("tab", { name: "Invite Member" }).click();
  await page.getByLabel("Email Address").fill(extraEmail);
  await page.getByRole("button", { name: "Send Invitation" }).click();
  const extraRow = page.getByRole("listitem").filter({ hasText: extraEmail });
  await expect(extraRow).toBeVisible();
  await extraRow.getByRole("button", { name: "Resend" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: extraEmail })).toHaveCount(1);
  await extraRow.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Cancel invitation" }).click();
  await expect(page.getByText(extraEmail)).toHaveCount(0);
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
  await inviteePage.getByLabel("Phone", { exact: true }).fill("9800000098");
  await inviteePage.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await inviteePage.getByLabel("Confirm password").fill("correct-horse-battery");
  await inviteePage.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await inviteePage.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(inviteePage, staffEmail);

  // No steps between verifying and the Dashboard: no onboarding wizard and no Accept click (AJ, 2026-10-01).
  await expect(inviteePage).toHaveURL(/\/dashboard$/);
  // The custom-link popup is gated on `tenant: ["edit"]` (AJ, 2026-09-19) —
  // Staff doesn't hold that permission, so it must NOT auto-open here even
  // though the org has never claimed a link. This `if` is just defensive;
  // it should never actually trigger for this role.
  const inviteeDialog = inviteePage.getByRole("dialog", { name: "Claim your custom link" });
  if (await inviteeDialog.isVisible().catch(() => false)) {
    await inviteePage.keyboard.press("Escape");
  }
  await expect(inviteeDialog).not.toBeVisible();
  // Dashboard welcome heading greets the signed-in person by name (Staff
  // Person, filled in above), not the business name — AJ's explicit ask,
  // 2026-09-16.
  await expect(inviteePage.getByRole("heading", { name: /Good (morning|afternoon|evening), Staff Person/ })).toBeVisible();

  // The critical proof: same organization, not a stray new one.
  const ownerOrgName = await getOrganizationNameForUser(ownerEmail);
  const inviteeOrgName = await getOrganizationNameForUser(staffEmail);
  expect(inviteeOrgName).toBe(ownerOrgName);
  expect(inviteeOrgName).toBe(businessName);

  // --- Owner sees the new member and disables them ---
  await page.goto("/settings/team");
  await expect(page.getByText("Staff Person")).toBeVisible();
  const staffRow = page.getByRole("listitem").filter({ hasText: "Staff Person" });
  await staffRow.getByRole("button", { name: "Disable" }).click();
  await page.getByRole("button", { name: "Disable", exact: true }).last().click();
  await expect(staffRow.getByText("Disabled")).toBeVisible();

  // --- Disabled invitee is locked out on their next request ---
  await inviteePage.reload();
  await expect(inviteePage.getByRole("heading", { name: /Good (morning|afternoon|evening), Staff Person/ })).not.toBeVisible();

  await inviteeContext.close();
});

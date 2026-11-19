import "dotenv/config";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { cleanupInviteeUser, cleanupOnboardingTestUser, countMembershipsForUser, getPendingInvitationId } from "./db";
import { signUpCaterer, signUpOnCentralPage } from "./auth-helpers";

/**
 * A team invitation that is cancelled (or runs out) after the invitee clicked it but before they finished creating their account. A team invitee never gets a business
 * of their own (they are a team member, not an Admin, and have no plan). The invitation page says it is no longer valid; and if they later sign in to Caterly with no team, the
 * "Setting up your account" page must not wait forever: once its wait runs out it says the invitation may no longer be valid and what to do. Needs the Platform (auth.localhost:3300), the mail sink and Caterly with PLATFORM_SSO_E2E=1, like platform-sso.spec.ts.
 */
test.skip(process.env.PLATFORM_SSO_E2E !== "1", "needs the Platform (auth.localhost:3300) and the mail sink running");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const owners: string[] = [];
const invitees: string[] = [];
test.afterEach(async () => {
  for (const email of invitees.splice(0)) await cleanupInviteeUser(email);
  for (const email of owners.splice(0)) await cleanupOnboardingTestUser(email);
});

test("an invitation cancelled before sign-up finishes: no business is made and the waiting page explains instead of spinning", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const ownerEmail = `lapsed-owner-${Date.now()}@auth.test`;
  const staffEmail = `lapsed-staff-${Date.now()}@auth.test`;
  owners.push(ownerEmail);
  invitees.push(staffEmail);

  await signUpCaterer(page, ownerEmail, { firstName: "Owner", lastName: "Person", phone: "9800000091" });
  await page.goto("/settings/team");
  await page.getByRole("tab", { name: "Invite Member" }).click();
  await page.getByLabel("Email Address").fill(staffEmail);
  await page.getByRole("button", { name: "Send Invitation" }).click();
  await expect(page.getByRole("tab", { name: /Pending Invitations/ })).toHaveAttribute("aria-selected", "true");
  const invitationId = await getPendingInvitationId(staffEmail);
  expect(invitationId).not.toBeNull();

  // The invitee clicks the link and lands on the central sign-up page; the Admin cancels the invitation before they finish.
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  await invitee.goto(`/invitations/${invitationId}/accept`);
  await pool.query("DELETE FROM invitation WHERE id = $1", [invitationId]);
  await signUpOnCentralPage(invitee, { email: staffEmail, firstName: "Staff", lastName: "Person", phone: "9800000092" });

  // Sign-up ends on the product; let that finish, then look at the wait page after its looks have run out (the page's own counter: n=20).
  await invitee.waitForURL(/catering\.localhost:3000/);
  await invitee.waitForLoadState("load");
  // Where sign-up sends them, the invitation page already says it is no longer valid.
  await expect(invitee.getByRole("heading", { name: "This invitation is no longer valid" })).toBeVisible();
  await invitee.goto("/kitchenlogin/setting-up?n=20");
  await expect(invitee.getByRole("heading", { name: "Setting up your account" })).toBeVisible();
  await expect(invitee.getByRole("status")).toContainText(/invitation/i);
  await expect(invitee.getByRole("status")).toContainText(/Business Admin/);
  // A team invitee belongs to no business here, and none was made for them.
  expect(await countMembershipsForUser(staffEmail)).toBe(0);
  await inviteeContext.close();
});

import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { codeFor, fill, newEmail, PASSWORD, registerAndSignIn, SINK } from "./signed-in";

/**
 * Admin transfer by invitation, through the pages: the Business Admin invites a brand-new person, who creates an account from the invitation link,
 * verifies, signs in and accepts. Needs DATABASE_URL (the Platform database, to seed the Admin's business) and the local mail sink. It writes permanent
 * audit rows, so run it only against a throwaway Platform database.
 */
test("a new person takes over as Business Admin through an invitation", async ({ browser }) => {
  test.setTimeout(180_000);
  const adminEmail = newEmail();
  const nomineeEmail = newEmail();
  const orgId = `biz_${randomBytes(16).toString("hex")}`;

  // The Admin registers and signs in at the Account.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await registerAndSignIn(admin, adminEmail, "/admin-role");
  await expect(admin).toHaveURL(/account\.localhost:3300/);

  // Seed the Admin's business (no product link, no slots) straight into the Platform database.
  const db = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
  await db.connect();
  try {
    const user = await db.query("select id from users where email = $1", [adminEmail]);
    expect(user.rowCount).toBe(1);
    await db.query("begin");
    await db.query("insert into organisations (id, name) values ($1, 'E2E Transfer Catering')", [orgId]);
    await db.query("insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, 'admin', 'active')", [orgId, user.rows[0].id]);
    await db.query("commit");
  } finally {
    await db.end();
  }

  // The Admin invites the new person.
  await admin.goto("/admin-role");
  await expect(admin.getByText("You are the Business Admin", { exact: true })).toBeVisible();
  await admin.getByLabel("Email of the new Business Admin").fill(nomineeEmail);
  await admin.getByLabel("Current password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByText("Invitation sent.")).toBeVisible();
  await expect(admin.getByText(`An invitation to ${nomineeEmail} is waiting`)).toBeVisible();

  // The invitation email carries the link.
  let link = "";
  for (let i = 0; i < 40 && !link; i++) {
    const messages = (await (await admin.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; html: string }[];
    const mail = messages.find((m) => m.to.includes(nomineeEmail) && /invited you to be the Business Admin/.test(m.subject));
    link = mail?.html.match(/href="([^"]*admin-transfer\?invite=[^"]+)"/)?.[1].replace(/&amp;/g, "&") ?? "";
    if (!link) await admin.waitForTimeout(250);
  }
  expect(link, "invitation email with a link").not.toBe("");

  // The new person, signed out, opens the link and creates an account from it.
  const nomCtx = await browser.newContext();
  const nom = await nomCtx.newPage();
  await nom.goto(link);
  await expect(nom.getByRole("heading", { name: "Business Admin invitation", level: 2 })).toBeVisible();
  await nom.getByRole("link", { name: "Create an account" }).click();
  await expect(nom).toHaveURL(/auth\.localhost:3300\/sign-up\?invite=/);
  await fill(nom, "First name", "New");
  await fill(nom, "Last name", "Admin");
  await fill(nom, "Phone", "9800000456");
  await fill(nom, "Confirm password", PASSWORD);
  await nom.getByRole("checkbox", { name: /I accept the Terms/ }).check();
  await fill(nom, "Email", nomineeEmail);
  await fill(nom, "Password", PASSWORD);
  await nom.getByRole("button", { name: "Create account" }).click();
  await expect(nom.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await fill(nom, "Verification code", await codeFor(nom, nomineeEmail));
  await nom.getByRole("button", { name: "Verify email" }).click();
  await expect(nom.getByText("Your email is verified. You can sign in now.")).toBeVisible();
  await fill(nom, "Email", nomineeEmail);
  await fill(nom, "Password", PASSWORD);
  await nom.getByRole("button", { name: "Sign in" }).click();
  await expect(nom.getByRole("heading", { name: "You are signed in" })).toBeVisible();
  await nom.getByRole("link", { name: "Go to my Account" }).click();

  // Back on the invitation, signed in: accept.
  await expect(nom).toHaveURL(/account\.localhost:3300\/admin-transfer\?invite=/);
  await nom.getByRole("button", { name: "Accept and become the Business Admin" }).click();
  await expect(nom.getByRole("status").filter({ hasText: /Business Admin/ }).first()).toBeVisible();

  // The new person now sees the Admin page; the old Admin is a former Admin.
  await nom.goto("/admin-role");
  await expect(nom.getByText("You are the Business Admin", { exact: true })).toBeVisible();
  await admin.goto("/admin-role");
  await expect(admin.getByText("Former Admin", { exact: true })).toBeVisible();

  // The same link cannot be used twice.
  await nom.goto(link);
  await expect(nom.getByRole("button", { name: "Accept and become the Business Admin" })).toHaveCount(0);
  await expect(nom.getByRole("status")).toBeVisible();

  await adminCtx.close();
  await nomCtx.close();
});

import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { newEmail, PASSWORD, registerAndSignIn, SINK } from "./signed-in";

/**
 * Admin transfer, the cases the main journey (admin-transfer.spec.ts) does not walk: the Admin withdraws, the nominee declines, the invitation runs out, and
 * the refusals (nominee already belongs to a business, inviting yourself, business locked or not active). Needs DATABASE_URL (the Platform database, to seed
 * and age the business) and the local mail sink. It writes permanent audit rows, so run it only against a throwaway Platform database.
 */
const ACCEPT = "Accept and become the Business Admin";
const db = () => new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
const orgIdOf = () => `biz_${randomBytes(16).toString("hex")}`;

async function sql<T = unknown>(run: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = db();
  await c.connect();
  try {
    return await run(c);
  } finally {
    await c.end();
  }
}

/** A registered, signed-in person with a page on the Account host. */
async function person(browser: Browser, email: string, startPath = "/") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await registerAndSignIn(page, email, startPath);
  await expect(page).toHaveURL(/account\.localhost:3300/); // sign-in started at an Account page, so it returns there
  return { ctx, page };
}

/** Seeds the person's business straight into the Platform database, with them as its active Admin. */
async function seedBusiness(email: string, name = "E2E Cases Catering") {
  const orgId = orgIdOf();
  await sql(async (c) => {
    const user = await c.query("select id from users where email = $1", [email]);
    expect(user.rowCount).toBe(1);
    await c.query("begin");
    await c.query("insert into organisations (id, name) values ($1, $2)", [orgId, name]);
    await c.query("insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, 'admin', 'active')", [orgId, user.rows[0].id]);
    await c.query("commit");
  });
  return orgId;
}

/** The Admin sends an invitation through the page and returns its link from the mail sink. */
async function invite(admin: Page, nomineeEmail: string): Promise<string> {
  await admin.goto("/admin-role");
  await expect(admin.getByText("You are the Business Admin", { exact: true })).toBeVisible();
  await admin.getByLabel("Email of the new Business Admin").fill(nomineeEmail);
  await admin.getByLabel("Current password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByText("Invitation sent.")).toBeVisible();
  for (let i = 0; i < 40; i++) {
    const messages = (await (await admin.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string; html: string }[];
    const mail = messages.find((m) => m.to.includes(nomineeEmail) && /invited you to be the Business Admin/.test(m.subject));
    const link = mail?.html.match(/href="([^"]*admin-transfer\?invite=[^"]+)"/)?.[1].replace(/&amp;/g, "&");
    if (link) return link;
    await admin.waitForTimeout(250);
  }
  throw new Error(`no invitation email for ${nomineeEmail}`);
}

async function mailTo(page: Page, to: string, subject: RegExp): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    const messages = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string }[];
    if (messages.some((m) => m.to.includes(to) && subject.test(m.subject))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** The Admin tries to invite and the page refuses with this message (the form stays). */
async function inviteRefused(admin: Page, email: string, message: RegExp) {
  await admin.goto("/admin-role");
  await admin.getByLabel("Email of the new Business Admin").fill(email);
  await admin.getByLabel("Current password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByRole("alert").filter({ hasText: message })).toBeVisible();
}

test("the Admin withdraws an invitation: the link stops working and the person is told", async ({ browser }) => {
  test.setTimeout(240_000);
  const adminEmail = newEmail();
  const nomineeEmail = newEmail();
  const adminP = await person(browser, adminEmail, "/admin-role");
  await seedBusiness(adminEmail);
  const link = await invite(adminP.page, nomineeEmail);

  await adminP.page.getByLabel("Current password").fill(PASSWORD);
  await adminP.page.getByRole("button", { name: "Withdraw the invitation" }).click();
  await expect(adminP.page.getByText("The invitation was withdrawn.")).toBeVisible();
  await expect(adminP.page.getByLabel("Email of the new Business Admin")).toBeVisible(); // free to invite again
  expect(await mailTo(adminP.page, nomineeEmail, /invitation was withdrawn/), "withdrawal email to the nominee").toBe(true);

  const nom = await person(browser, nomineeEmail);
  await nom.page.goto(link);
  await expect(nom.page.getByText("This invitation has already been answered or withdrawn.")).toBeVisible();
  await expect(nom.page.getByRole("button", { name: ACCEPT })).toHaveCount(0);
  await adminP.ctx.close();
  await nom.ctx.close();
});

test("the nominee declines: the Admin is told, stays Admin and can invite again", async ({ browser }) => {
  test.setTimeout(240_000);
  const adminEmail = newEmail();
  const nomineeEmail = newEmail();
  const adminP = await person(browser, adminEmail, "/admin-role");
  await seedBusiness(adminEmail);
  const nom = await person(browser, nomineeEmail);
  const link = await invite(adminP.page, nomineeEmail);

  await nom.page.goto(link);
  await expect(nom.page.getByRole("heading", { name: "Business Admin invitation", level: 2 })).toBeVisible();
  await nom.page.getByRole("button", { name: "Decline" }).click();
  await expect(nom.page.getByText("You declined the invitation. The current Admin has been told.")).toBeVisible();
  expect(await mailTo(adminP.page, adminEmail, /invitation was declined/), "declined email to the Admin").toBe(true);

  await nom.page.goto(link);
  await expect(nom.page.getByText("This invitation has already been answered or withdrawn.")).toBeVisible();
  await adminP.page.goto("/admin-role");
  await expect(adminP.page.getByText("You are the Business Admin", { exact: true })).toBeVisible();
  await expect(adminP.page.getByLabel("Email of the new Business Admin")).toBeVisible();
  await adminP.ctx.close();
  await nom.ctx.close();
});

test("an invitation that ran out cannot be accepted and the Admin can invite again", async ({ browser }) => {
  test.setTimeout(240_000);
  const adminEmail = newEmail();
  const nomineeEmail = newEmail();
  const adminP = await person(browser, adminEmail, "/admin-role");
  const orgId = await seedBusiness(adminEmail);
  const nom = await person(browser, nomineeEmail);
  const link = await invite(adminP.page, nomineeEmail);

  // A fixed past date, not now() - 1 hour: the app writes its own timestamps with a different offset from the database clock (see the 2026-11-13 note in MEMORY.md).
  await sql((c) => c.query("update ownership_transfers set expires_at = '2000-01-01' where organisation_id = $1 and status = 'pending'", [orgId]));
  await nom.page.goto(link);
  await expect(nom.page.getByText("This invitation has expired. Ask the current Admin to send a new one.")).toBeVisible();
  await expect(nom.page.getByRole("button", { name: ACCEPT })).toHaveCount(0);

  await adminP.page.goto("/admin-role");
  await expect(adminP.page.getByText(/An invitation to .* is waiting/)).toHaveCount(0);
  await expect(adminP.page.getByLabel("Email of the new Business Admin")).toBeVisible();
  await adminP.ctx.close();
  await nom.ctx.close();
});

test("refusals: inviting yourself, someone who already belongs to a business, a locked or inactive business, and a business that stops being active before the answer", async ({ browser }) => {
  test.setTimeout(300_000);
  const adminEmail = newEmail();
  const memberEmail = newEmail();
  const nomineeEmail = newEmail();
  const adminP = await person(browser, adminEmail, "/admin-role");
  const orgId = await seedBusiness(adminEmail);

  // Yourself.
  await inviteRefused(adminP.page, adminEmail, /You are already the Business Admin/);

  // Someone who already belongs to another business (an employee, say).
  const memberP = await person(browser, memberEmail);
  await seedBusiness(memberEmail, "Someone Else's Catering");
  await inviteRefused(adminP.page, memberEmail, /already belongs to a business or a product/);
  await memberP.ctx.close();

  // Invite a free person, then the business is suspended before they answer: accepting is refused and nothing moves.
  const nom = await person(browser, nomineeEmail);
  const link = await invite(adminP.page, nomineeEmail);
  await sql((c) => c.query("update organisations set status = 'suspended' where id = $1", [orgId]));
  await nom.page.goto(link);
  await nom.page.getByRole("button", { name: ACCEPT }).click();
  await expect(nom.page.getByRole("alert").filter({ hasText: "This business is not active, so its Admin cannot change." })).toBeVisible();
  await adminP.page.goto("/admin-role");
  await expect(adminP.page.getByText("You are the Business Admin", { exact: true })).toBeVisible();
  await expect(adminP.page.getByText(/An invitation to .* is waiting/)).toBeVisible();

  // The Admin's page says why a new invitation cannot be sent, instead of showing the form. Withdraw first so the form would otherwise show.
  await adminP.page.getByLabel("Current password").fill(PASSWORD);
  await adminP.page.getByRole("button", { name: "Withdraw the invitation" }).click();
  await expect(adminP.page.getByText("The invitation was withdrawn.")).toBeVisible();
  await expect(adminP.page.getByText("This business is not active, so its Admin cannot change.")).toBeVisible();
  await expect(adminP.page.getByLabel("Email of the new Business Admin")).toHaveCount(0);

  await sql((c) => c.query("update organisations set status = 'active', ownership_locked = true where id = $1", [orgId]));
  await adminP.page.goto("/admin-role");
  await expect(adminP.page.getByText("This business cannot change its Admin right now. Please contact Platterly support.")).toBeVisible();
  await expect(adminP.page.getByLabel("Email of the new Business Admin")).toHaveCount(0);

  // After all of this the Admin is still the Admin.
  const roles = await sql((c) => c.query("select central_role, status from organisation_members where organisation_id = $1", [orgId]));
  expect(roles.rows).toEqual([{ central_role: "admin", status: "active" }]);
  await adminP.ctx.close();
  await nom.ctx.close();
});

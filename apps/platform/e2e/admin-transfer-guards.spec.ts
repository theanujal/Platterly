import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * Admin transfer, the gaps the other specs leave: the Admin's page says why no invitation can be sent while a sign-in email change can still be cancelled or the
 * account is under review, and the Old Admin's page fits a phone. Needs DATABASE_URL (Platform) and IDENTITY_DATABASE_URL, plus the local mail sink. Writes a
 * business, so run it only against the local throwaway databases; the business, change and hold rows it makes are removed in a `finally`, even when a check fails.
 */
const strip = (url: string | undefined) => (url ?? "").replace(/\?.*$/, "");
async function sql<T = unknown>(url: string | undefined, run: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: strip(url) });
  await c.connect();
  try {
    return await run(c);
  } finally {
    await c.end();
  }
}
const platform = <T,>(run: (c: pg.Client) => Promise<T>) => sql(process.env.DATABASE_URL, run);
const identity = <T,>(run: (c: pg.Client) => Promise<T>) => sql(process.env.IDENTITY_DATABASE_URL, run);

async function seedBusiness(email: string, role: "admin" | "former_admin") {
  const orgId = `biz_${randomBytes(16).toString("hex")}`;
  await platform(async (c) => {
    let user = await c.query("select id from users where email = $1", [email]);
    for (let i = 0; i < 30 && user.rowCount === 0; i++) {
      await new Promise((r) => setTimeout(r, 500)); // the Platform's copy of the person is made by the first Account page's API call
      user = await c.query("select id from users where email = $1", [email]);
    }
    expect(user.rowCount).toBe(1);
    await c.query("begin");
    await c.query("insert into organisations (id, name) values ($1, $2)", [orgId, "E2E Guards Catering"]);
    await c.query("insert into organisation_members (organisation_id, user_id, central_role, status) values ($1, $2, $3, 'active')", [orgId, user.rows[0].id, role]);
    await c.query("commit");
  });
  return orgId;
}

/** Removes the business a test seeded (its members go with it) and the identity rows it added, so a failed run cannot break the next one. */
async function cleanUp(orgIds: string[], identityId: string | null, changeId: string | null) {
  for (const id of orgIds) await platform((c) => c.query("delete from organisations where id = $1", [id])).catch(() => undefined);
  if (identityId) await identity((c) => c.query('delete from "accountHold" where "userId" = $1', [identityId])).catch(() => undefined);
  if (changeId) await identity((c) => c.query('delete from "emailChange" where "id" = $1', [changeId])).catch(() => undefined);
}

test("the Admin's page says why an invitation cannot be sent while an email change is open or the account is under review", async ({ page }) => {
  test.setTimeout(180_000);
  const email = newEmail();
  await registerAndSignIn(page, email, "/admin-role");
  await expect(page).toHaveURL(/account\.localhost:3300/);
  const orgId = await seedBusiness(email, "admin");
  const identityId = await identity(async (c) => (await c.query('select id from "user" where email = $1', [email])).rows[0].id as string);
  const changeId = `guard-${randomBytes(8).toString("hex")}`;
  try {
    const form = page.getByLabel("Email of the new Business Admin");

    await page.goto("/admin-role");
    await expect(form).toBeVisible();

    // A sign-in email change that can still be cancelled (waiting for its code).
    await identity((c) => c.query(`insert into "emailChange" ("id","userId","oldEmail","newEmail","status","codeExpiresAt") values ($3,$1,$2,'new@auth.test','pending', now() + interval '1 hour')`, [identityId, email, changeId]));
    await page.goto("/admin-role");
    await expect(page.getByText("You changed your sign-in email recently and it can still be cancelled. Try again after 24 hours.")).toBeVisible();
    await expect(form).toHaveCount(0);

    // The change ended, but the account is under review.
    await identity(async (c) => {
      await c.query(`update "emailChange" set "status" = 'cancelled' where "id" = $1`, [changeId]);
      await c.query(`insert into "accountHold" ("userId","reviewId","reason") values ($1,$2,'not_me')`, [identityId, changeId]);
    });
    await page.goto("/admin-role");
    await expect(page.getByText("Your account is under review, so the Admin cannot change right now.")).toBeVisible();
    await expect(form).toHaveCount(0);

    await identity(async (c) => {
      await c.query(`delete from "accountHold" where "userId" = $1`, [identityId]);
      await c.query(`delete from "emailChange" where "id" = $1`, [changeId]);
    });
    await page.goto("/admin-role");
    await expect(form).toBeVisible();
  } finally {
    await cleanUp([orgId], identityId, changeId);
  }
});

test("the Old Admin's page fits a phone and offers nothing to change", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const page = await ctx.newPage();
  const email = newEmail();
  await registerAndSignIn(page, email, "/admin-role");
  await expect(page).toHaveURL(/account\.localhost:3300/);
  const orgId = await seedBusiness(email, "former_admin");
  try {
    await page.goto("/admin-role");
    await expect(page.getByText("Former Admin", { exact: true })).toBeVisible();
    await expect(page.getByText(/You handed the Business Admin role of E2E Guards Catering to someone else/)).toBeVisible();
    await expect(page.getByLabel("Email of the new Business Admin")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await ctx.close();
    await cleanUp([orgId], null, null);
  }
});

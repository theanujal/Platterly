import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { PASSWORD, fill, newEmail, registerAndSignIn } from "./signed-in";

/**
 * An approved account deletion blocks sign-in until staff restore it. Real flow, dev databases: the person asks for deletion (the Platform sends the request to
 * Ops), staff approval is simulated by setting the Ops row to APPROVED (the real click is `approveAccountDeletion`), the Platform picks the decision up and
 * ends the person's sessions, sign-in is refused, and a restore lets them in again. Needs Ops on 3200 and the Platform started by `~/.platterly/f4dev/dev.sh`.
 * The Ops row is removed at the end; `@auth.test` people are removed by scripts/clean-test-people.mjs --apply.
 */
const ACCOUNT = "http://account.localhost:3300";
const ops = (statement: string) => execFileSync("psql", ["-d", "platterly_ops", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" }).trim();

test("an approved deletion refuses sign-in and ends open sessions; a restore lets the person back in", async ({ page }) => {
  test.setTimeout(120_000);
  const email = newEmail();
  try {
    await registerAndSignIn(page, email, `${ACCOUNT}/profile`);
    await expect(page).toHaveURL(`${ACCOUNT}/profile`);

    const asked = await page.request.post(`${ACCOUNT}/api/account/deletion`, { headers: { origin: ACCOUNT }, data: { password: PASSWORD, reason: "block test" } });
    expect(asked.status()).toBe(200);
    expect(ops(`select status from account_deletion_request where email='${email}'`)).toBe("PENDING");

    // Staff approve in Ops (simulated); nothing is erased, it is a 30-day hold.
    ops(`update account_deletion_request set status='APPROVED', "decidedAt"=now(), "decidedBy"='e2e', "eraseAfter"=now() + interval '30 days' where email='${email}'`);
    // The Platform pulls the decision when the person opens their data page; it ends their sessions.
    await page.request.get(`${ACCOUNT}/api/account/deletion`);
    await page.goto(`${ACCOUNT}/profile`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);

    await fill(page, "Email", email);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForTimeout(3000);
    // Still on the sign-in service's own page (the account address only appears inside its redirect_uri parameter), never sent on to the Account.
    expect(new URL(page.url()).host).toBe("auth.localhost:3300");

    ops(`update account_deletion_request set status='RESTORED' where email='${email}'`);
    await page.goto(`${ACCOUNT}/profile`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    await fill(page, "Email", email);
    await fill(page, "Password", PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${ACCOUNT}/profile`, { timeout: 30_000 });
  } finally {
    ops(`delete from account_deletion_request where email='${email}'`);
  }
});

/**
 * Erase now, end to end on the dev databases: after staff approve and press Erase now (simulated by the Ops rows; the real step is `requestAccountErasure`), the
 * Platform's scheduled pass erases the person and any business the sign-up made, reports back, and Ops closes the request as ERASED with the details wiped.
 * Needs the Platform started with CRON_SECRET and IDENTITY_DATABASE_URL in the test's environment.
 */
const identity = (statement: string) => execFileSync("psql", [process.env.IDENTITY_DATABASE_URL ?? "", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" }).trim();

test("Erase now removes the person and reports back; Ops closes the request with the details wiped", async ({ page }) => {
  test.skip(!process.env.CRON_SECRET || !process.env.IDENTITY_DATABASE_URL, "needs CRON_SECRET and IDENTITY_DATABASE_URL");
  test.setTimeout(120_000);
  const email = newEmail();
  try {
    await registerAndSignIn(page, email, `${ACCOUNT}/profile`);
    await expect(page).toHaveURL(`${ACCOUNT}/profile`);
    const asked = await page.request.post(`${ACCOUNT}/api/account/deletion`, { headers: { origin: ACCOUNT }, data: { password: PASSWORD, reason: "erase test" } });
    expect(asked.status()).toBe(200);
    expect(identity(`select count(*) from "user" where email='${email}'`)).toBe("1");

    ops(`update account_deletion_request set status='APPROVED', "decidedAt"=now(), "decidedBy"='e2e', "eraseAfter"=now() + interval '30 days' where email='${email}'`);
    const cron = () => page.request.post(`${ACCOUNT}/api/cron/account`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    // The pass picks the approval up first (sessions end), and does not erase anything staff have not asked for.
    expect((await cron()).status()).toBe(200);
    expect(identity(`select count(*) from "user" where email='${email}'`)).toBe("1");

    ops(`update account_deletion_request set "eraseRequestedAt"=now(), "eraseLogoUrls"='[]'::jsonb where email='${email}'`);
    const done = await cron();
    expect(done.status()).toBe(200);
    expect(await done.json()).toMatchObject({ accountsErased: 1 });
    expect(identity(`select count(*) from "user" where email='${email}'`)).toBe("0");
    expect(identity(`select count(*) from "erasureReceipt" where "reportedAt" is not null`)).not.toBe("0");
    expect(ops(`select status||'|'||name||'|'||email from account_deletion_request where "eraseRequestedAt" is not null and name='Erased' order by "erasedAt" desc limit 1`)).toBe("ERASED|Erased|erased");
  } finally {
    ops(`delete from account_deletion_request where email='${email}' or (status='ERASED' and name='Erased' and "decidedBy"='e2e')`);
  }
});

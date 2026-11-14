import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * A person who belongs to the business but is not its active Admin (here the Old Admin, after an Admin transfer) is told plainly in the Store that plans and payments are
 * their Admin's, instead of "your access has ended" (2026-11-15). Throwaway copy of the Platform database only (it refuses otherwise): DATABASE_URL.
 */
const STORE = "http://store.localhost:3300";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";

function sql(statement: string): string {
  const url = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error("store-not-admin.spec.ts refuses to run unless DATABASE_URL is a throwaway copy");
  try {
    return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`psql failed: ${String((error as { stderr?: string }).stderr ?? "").trim()}`);
  }
}

async function becomeBhandarysAdmin(page: Page): Promise<void> {
  const email = newEmail();
  await registerAndSignIn(page, email, `${STORE}/`, "Store Person");
  await expect(page).toHaveURL(`${STORE}/`);
  const linked = sql(`begin; update organisation_members set central_role='former_admin' where organisation_id='${BHANDARYS}' and central_role='admin' and status='active'; insert into organisation_members (organisation_id, user_id, central_role) select '${BHANDARYS}', id, 'admin' from users where email='${email}'; commit; select count(*) from organisation_members m join users u on u.id=m.user_id where m.organisation_id='${BHANDARYS}' and m.central_role='admin' and m.status='active' and u.email='${email}'`);
  expect(linked.split("\n").pop()).toBe("1");
}

test("the Old Admin is told that plans and payments are their Admin's, on the Store home and on a plan page", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await becomeBhandarysAdmin(page);
  // A new person takes over as Admin; the first becomes the Old Admin (a former_admin row that stays active and read-only).
  const other = await browser.newPage();
  await becomeBhandarysAdmin(other);
  await other.close();

  await page.goto(`${STORE}/`);
  // (Next's route announcer is also an alert, so the line is found by its own class.)
  const note = page.locator("p.ps-warn");
  await expect(note).toContainText("Plans and payments are managed by your business's Admin");
  await expect(note).not.toContainText("access");
  await page.goto(`${STORE}/manage/caterly`);
  await expect(page.getByRole("heading", { name: "Only your business's Admin can change the plan" })).toBeVisible();
  await expect(page.getByText("Ask them to make the change.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay ₹/ })).toHaveCount(0);
});

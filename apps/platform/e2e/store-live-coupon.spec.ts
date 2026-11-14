import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * Coupons in the live Store (plan slice C3, 2026-11-14): a typed code is checked by Ops, the discount comes off before GST, a refused code says why, and a paid
 * coupon order is recorded with the coupon and the discount. Real Razorpay TEST checkout, throwaway copies of the Platform and Ops databases only (it refuses
 * otherwise): DATABASE_URL = the Platform copy, OPS_THROWAWAY_DATABASE_URL = the Ops copy. The tests share one signed-in person and run in order.
 */
const STORE = "http://store.localhost:3300";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";

function sql(urlEnv: "DATABASE_URL" | "OPS_THROWAWAY_DATABASE_URL", statement: string): string {
  const url = (process.env[urlEnv] ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error(`store-live-coupon.spec.ts refuses to run unless ${urlEnv} is a throwaway copy`);
  try {
    return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    // Never let the connection string (it carries the role's password) reach the test report.
    throw new Error(`psql failed: ${String((error as { stderr?: string }).stderr ?? "").trim()}`);
  }
}
const ops = (statement: string) => sql("OPS_THROWAWAY_DATABASE_URL", statement);



/** Registers a person, signs in, and makes them the Admin of Bhandarys Kitchen in the throwaway Platform copy. */
async function signInAsBhandarysAdmin(page: Page): Promise<string> {
  const email = newEmail();
  await registerAndSignIn(page, email, `${STORE}/`, "Store Buyer");
  await expect(page).toHaveURL(`${STORE}/`);
  // The database refuses to swap the person on an Admin row, so this mirrors what an Admin transfer leaves behind: the old Admin becomes former_admin and the new
  // person gets the Admin row. One transaction, because an organisation may never be without an Admin at commit.
  const linked = sql("DATABASE_URL", `begin; update organisation_members set central_role='former_admin' where organisation_id='${BHANDARYS}' and central_role='admin' and status='active'; insert into organisation_members (organisation_id, user_id, central_role) select '${BHANDARYS}', id, 'admin' from users where email='${email}'; commit; select count(*) from organisation_members m join users u on u.id=m.user_id where m.organisation_id='${BHANDARYS}' and m.central_role='admin' and m.status='active' and u.email='${email}'`);
  expect(linked.split("\n").pop()).toBe("1");
  return email;
}

async function fillBilling(page: Page) {
  await page.getByLabel("Business name").fill("Bhandarys Kitchen");
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("PIN code").fill("411001");
}

/** Opens the Manage page, picks the yearly price of a plan and fills the billing details; stops with Pay available. */
async function chooseAnnual(page: Page, planName: string, button: "Subscribe" | "Upgrade", fill = true) {
  await page.goto(`${STORE}/manage/caterly`);
  await page.getByRole("button", { name: "Annual" }).click();
  await page.getByRole("article").filter({ hasText: planName }).getByRole("button", { name: button }).click();
  if (fill) await fillBilling(page);
  await expect(page.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
}

/**
 * Pays in Razorpay's test checkout: mobile number, the test card, "Maybe later" on its save-card offer, then the demo bank page where the test chooses the
 * outcome. Resolves after the bank page has been answered.
 */
async function payInRazorpay(page: Page, outcome: "Success" | "Failure") {
  const bank = page.context().waitForEvent("page", { timeout: 60_000 });
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  const frame = page.frameLocator("iframe.razorpay-checkout-frame");
  // Razorpay refuses obviously sequential numbers; it moves on by itself once the number is accepted. A second payment in the same session is not asked again.
  const mobile = frame.getByPlaceholder("Mobile number");
  if (await mobile.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)) await mobile.pressSequentially("9845671203", { delay: 60 });
  await frame.getByText("Cards", { exact: true }).first().click();
  await frame.getByText("Add a new card").click();
  await frame.locator('input[name="card.number"]').pressSequentially("4111111111111111", { delay: 40 });
  await frame.locator('input[name="card.expiry"]').pressSequentially("1230", { delay: 40 });
  await frame.locator('input[name="card.cvv"]').pressSequentially("123", { delay: 40 });
  await frame.getByPlaceholder("Enter Email").fill("buyer@auth.test");
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  await frame.getByText("Maybe later", { exact: true }).locator("visible=true").first().click({ timeout: 8000 }).catch(() => {});
  const popup = await bank;
  await popup.getByRole("button", { name: outcome }).click();
  // Razorpay offers to save the card again over the result; a payment that went through closes the window by itself, a failed one stays open.
  await frame.getByText("Maybe later", { exact: true }).locator("visible=true").first().click({ timeout: 10_000, force: true }).catch(() => {});
}


test.describe.configure({ mode: "serial" });

test.describe("Live Store: coupons", () => {
  let page: Page;
  const total = () => page.getByTestId("total").last();
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAsBhandarysAdmin(page);
    ops(`insert into coupon (id, code, kind, value, active, "maxUses", "createdAt") values ('cpn_e2e10', 'STORE10', 'PERCENT', 10, true, 1, now()), ('cpn_e2e_off', 'STOREOFF', 'FIXED', 500, false, null, now())`);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test("a code Ops refuses says why and leaves the price alone; a paused code reads as not valid", async () => {
    await chooseAnnual(page, "Premium", "Subscribe");
    await expect(total()).toHaveText(/38,940/);
    await page.getByLabel(/Coupon code/).fill("NOPE");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("coupon-message")).toHaveText("That coupon code is not valid.");
    await page.getByLabel(/Coupon code/).fill("storeoff");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("coupon-message")).toHaveText("That coupon code is not valid.");
    await expect(total()).toHaveText(/38,940/);
    await expect(page.getByTestId("discount")).toHaveCount(0);
  });

  test("an accepted code takes the discount off before GST, and Remove puts the price back", async () => {
    await page.getByLabel(/Coupon code/).fill("store10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("coupon-applied")).toContainText("STORE10");
    await expect(page.getByTestId("discount")).toHaveText(/3,300/);
    await expect(page.getByTestId("gst")).toHaveText(/5,346/);
    await expect(total()).toHaveText(/35,046/);
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("discount")).toHaveCount(0);
    await expect(total()).toHaveText(/38,940/);
    await page.getByLabel(/Coupon code/).fill("STORE10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(total()).toHaveText(/35,046/);
  });

  test("paying with the coupon charges the discounted total, and Ops records the coupon, the discount and one use", async () => {
    test.setTimeout(180_000);
    await chooseAnnual(page, "Premium", "Subscribe");
    await page.getByLabel(/Coupon code/).fill("STORE10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(total()).toHaveText(/35,046/);
    await expect(page.getByRole("button", { name: "Pay ₹35,046" })).toBeVisible();
    await payInRazorpay(page, "Success");
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 40_000 });
    expect(await ops(`select p.total||'|'||p."couponDiscount"||'|'||c.code||'|'||p.status from subscription_payment p join coupon c on c.id=p."couponId" where p."businessId"='${BHANDARYS}' and p.status='PAID'`)).toBe("35046.00|3300.00|STORE10|PAID");
    expect(await ops(`select count(*) from subscription_payment where "couponId"='cpn_e2e10' and status='PAID'`)).toBe("1");
  });
});

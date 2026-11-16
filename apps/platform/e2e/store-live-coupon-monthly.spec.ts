import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";
import { expectSavedProfile, seedBillingProfile } from "./store-live-profile";

/**
 * A coupon on a MONTHLY plan in the live Store (slice C4, 2026-11-14): the coupon is the first month only. The owner authorises auto-pay in Razorpay's TEST window
 * (recurring card), pays the discounted first month now, and the full price renews one cycle later. Throwaway copies of the Platform and Ops databases only:
 * DATABASE_URL = the Platform copy, OPS_THROWAWAY_DATABASE_URL = the Ops copy. The tests share one signed-in person and run in order.
 */
const STORE = "http://store.localhost:3300";
const ACCOUNT = "http://account.localhost:3300";
/** The only recurring-eligible Razorpay test card (others answer "not eligible for recurring payments"), so every saved method here is this card. */
const RECURRING_CARD = "4718609108204366";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";

function sql(urlEnv: "DATABASE_URL" | "OPS_THROWAWAY_DATABASE_URL", statement: string): string {
  const url = (process.env[urlEnv] ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error(`store-live-coupon-monthly.spec.ts refuses to run unless ${urlEnv} is a throwaway copy`);
  try {
    return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    // Never let the connection string (it carries the role's password) reach the test report.
    throw new Error(`psql failed: ${String((error as { stderr?: string }).stderr ?? "").trim()}`);
  }
}
const ops = (statement: string) => sql("OPS_THROWAWAY_DATABASE_URL", statement);

/** Bhandarys Kitchen's money records in Ops. */
const paid = () => ops(`select count(*) from subscription_payment where "businessId"='${BHANDARYS}' and status='PAID'`);
const current = () => ops(`select s.status||'|'||p.code||'|'||coalesce(s."billingInterval"::text,'') from subscription s join plan p on p.id=s."planId" where s."businessId"='${BHANDARYS}' and s.status in ('ACTIVE','TRIALING') order by s."createdAt" desc limit 1`);

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
  // Nothing is typed any more: the checkout shows the product's saved billing profile (seeded in beforeAll).
  await expectSavedProfile(page);
}

/** Opens the Manage page, picks the MONTHLY price of a plan and checks the saved billing profile; stops with Pay available. */
async function chooseMonthly(p: Page, planName: string, button: "Subscribe" | "Upgrade") {
  await p.goto(`${STORE}/manage/caterly`);
  await p.getByRole("button", { name: "Monthly" }).click();
  await p.getByRole("article").filter({ hasText: planName }).getByRole("button", { name: button }).click();
  await fillBilling(p);
  await expect(p.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
}

/**
 * Authorises the auto-pay in Razorpay's test window with the documented recurring test card (Visa 4718 6091 0820 4366, any CVV and future expiry, any OTP) and
 * accepts "Yes, secure my card", which recurring payments require. Other test cards say "not eligible for recurring payments".
 */
async function authoriseAutoPay(p: Page, cardNumber = RECURRING_CARD) {
  await p.getByRole("button", { name: /^Pay ₹/ }).click();
  await completeRazorpayCard(p, cardNumber);
}

/** The card steps of Razorpay's test window, from the mobile number to the OTP; the window must already be open. */
async function completeRazorpayCard(p: Page, cardNumber: string) {
  const frame = p.frameLocator("iframe.razorpay-checkout-frame");
  const mobile = frame.getByPlaceholder("Mobile number");
  if (await mobile.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) await mobile.pressSequentially("9845671203", { delay: 60 });
  await frame.getByText("Cards", { exact: true }).first().click();
  const addCard = frame.getByText("Add a new card");
  if (await addCard.isVisible().catch(() => false)) await addCard.click();
  const number = frame.locator('input[name="card.number"]');
  await number.click();
  await number.pressSequentially(cardNumber, { delay: 120 });
  // Razorpay reformats the field as it detects the card; if typing was cut short, replace it in one go.
  if ((await number.inputValue()).replace(/\s/g, "") !== cardNumber) {
    await number.clear();
    await number.fill(cardNumber);
  }
  await frame.locator('input[name="card.expiry"]').pressSequentially("1230", { delay: 40 });
  await frame.locator('input[name="card.cvv"]').pressSequentially("123", { delay: 40 });
  // Saving the card is required for renewals; the registration window leaves the box unticked.
  const save = frame.getByRole("checkbox", { name: /Save this card/i });
  if ((await save.count()) > 0 && !(await save.isChecked().catch(() => true))) await save.check({ force: true }).catch(() => {});
  const name = frame.locator('input[name="card.name"]');
  if (await name.isVisible().catch(() => false)) await name.fill("Store Buyer");
  const email = frame.getByPlaceholder("Enter Email");
  if (await email.isVisible().catch(() => false)) await email.fill("buyer@auth.test");
  await frame.getByRole("button", { name: "Continue", exact: true }).click();
  await frame.getByText("Yes, secure my card", { exact: true }).locator("visible=true").first().click({ timeout: 30_000, force: true }).catch(() => {});
  // The test bank's OTP step: any 6-digit code. It can open in a pop-up or inside the window.
  const otp = frame.getByPlaceholder(/OTP/i);
  if (await otp.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false)) {
    await otp.pressSequentially("123456", { delay: 40 });
    await frame.getByRole("button", { name: "Continue", exact: true }).locator("visible=true").last().click();
    await p.waitForTimeout(8000);
  }
}


test.describe.configure({ mode: "serial" });

test.describe("Live Store: a coupon on a monthly plan", () => {
  let page: Page;
  const total = () => page.getByTestId("total").last();
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAsBhandarysAdmin(page);
    seedBillingProfile(ops, BHANDARYS);
    ops(`insert into coupon (id, code, kind, value, active, "createdAt") values ('cpn_e2e_m10', 'MONTH10', 'PERCENT', 10, true, now())`);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test("the summary shows the discounted first month and what it renews at afterwards", async () => {
    await chooseMonthly(page, "Premium", "Subscribe");
    await expect(total()).toHaveText(/3,540/);
    await page.getByLabel(/Coupon code/).fill("month10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("coupon-applied")).toContainText("MONTH10");
    await expect(page.getByTestId("discount")).toHaveText(/300/);
    await expect(total()).toHaveText(/3,186/);
    await expect(page.getByTestId("renewal")).toContainText("3,540");
    await expect(page.getByRole("button", { name: "Pay ₹3,186" })).toBeVisible();
  });

  test("authorising auto-pay charges the discounted first month, and the full price renews one cycle later", async () => {
    test.setTimeout(240_000);
    const before = Number(await paid());
    await authoriseAutoPay(page);
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 90_000 });
    expect(Number(await paid())).toBe(before + 1);
    expect(await current()).toMatch(/^ACTIVE\|premium\|MONTHLY$/);
    expect(await ops(`select p.total||'|'||p."couponDiscount"||'|'||c.code from subscription_payment p join coupon c on c.id=p."couponId" where p."businessId"='${BHANDARYS}' and p.status='PAID'`)).toBe("3186.00|300.00|MONTH10");
    expect(await ops(`select "autoPay"::text||'|'||("razorpaySubscriptionId" like 'sub_%')::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("ACTIVE|true");
    // The first month is paid until the renewal date, about 30 days away, where Razorpay charges the plan's full price.
    const days = Number(await ops(`select round(extract(epoch from ("currentPeriodEnd" - now())) / 86400) from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`));
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  test("the Account shows auto-pay on and the next billing date a month away", async () => {
    await page.goto(`${ACCOUNT}/subscriptions/caterly`);
    const caterly = page.getByTestId("subscription-caterly");
    await expect(caterly.getByRole("region", { name: "Billing information" })).toContainText("Auto-pay every 30 days");
    await expect(caterly.getByTestId("autopay-status")).toContainText("On");
    await caterly.getByTestId("billing-history").click();
    await expect(page.getByTestId("payments-list")).toContainText("₹3,186");
  });
});

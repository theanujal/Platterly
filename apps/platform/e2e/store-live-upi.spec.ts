import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * The LIVE Store, monthly auto-pay paid with UPI (step 3b): a monthly plan is always auto-renewal, so the Store opens Razorpay's auto-pay window (a subscription for the
 * business's Razorpay customer) with the recurring test card, Ops pays the first month, makes the plan ACTIVE and saves the card as the primary payment method.
 * Needs what store-live.spec.ts needs (Platform with the Ops settings, Ops on 3200, internet access to Razorpay's test checkout) and the same safety rule:
 * it writes real payments and audit rows, so it runs ONLY against throwaway copies of the Platform and Ops databases (it refuses otherwise):
 *   DATABASE_URL               = the throwaway Platform copy (the Platform server must use the same one)
 *   OPS_THROWAWAY_DATABASE_URL = the throwaway Ops copy (Ops on 3200 must use the same one)
 * The new test person is made Admin of Bhandarys Kitchen (a trialing business that exists in both databases) the way an Admin transfer leaves things.
 * The tests share one signed-in person and build on each other, so they run in order. The last one demotes that person to Old Admin.
 */
const STORE = "http://store.localhost:3300";
const ACCOUNT = "http://account.localhost:3300";
/** The only recurring-eligible Razorpay test card (others answer "not eligible for recurring payments"), so every saved method here is this card. */
const RECURRING_CARD = "4718609108204366";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";

function sql(urlEnv: "DATABASE_URL" | "OPS_THROWAWAY_DATABASE_URL", statement: string): string {
  const url = (process.env[urlEnv] ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error(`store-live-autopay.spec.ts refuses to run unless ${urlEnv} is a throwaway copy`);
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
  await page.getByLabel("Business name").fill("Bhandarys Kitchen");
  await page.getByLabel("Address line 1").fill("12 MG Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("State").fill("Maharashtra");
  await page.getByLabel("PIN code").fill("411001");
}

/** Opens the Manage page, picks the MONTHLY price of a plan and fills the billing details; stops with Pay available. */
async function chooseMonthly(p: Page, planName: string, button: "Subscribe" | "Upgrade") {
  await p.goto(`${STORE}/manage/caterly`);
  await p.getByRole("button", { name: "Monthly" }).click();
  await p.getByRole("article").filter({ hasText: planName }).getByRole("button", { name: button }).click();
  await fillBilling(p);
  await expect(p.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
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

/**
 * Pays with UPI in the open window. For an auto-pay Razorpay offers only "UPI QR" (no UPI id box); in test mode "Show QR" is the simulated scan and the payment
 * succeeds by itself, with the test UPI id testuser@razorpay.
 */
async function payWithUpiQr(p: Page) {
  const frame = p.frameLocator("iframe.razorpay-checkout-frame");
  const mobile = frame.getByPlaceholder("Mobile number");
  if (await mobile.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) await mobile.pressSequentially("9845671203", { delay: 60 });
  await frame.getByText("UPI", { exact: true }).first().click();
  await frame.getByText("Show QR", { exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("Live Store: UPI auto-pay", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAsBhandarysAdmin(page);
  });
  test.afterAll(async () => {
    await page.close();
  });
  const methodRows = () => page.getByTestId("method-row");
  const secondaryRow = () => methodRows().filter({ hasNot: page.locator(".pa-badge") });
  const methods = () => ops(`select string_agg(kind||'|'||label||'|'||coalesce(("razorpaySubscriptionId" = (select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null))::text, 'false'), ';' order by kind, "createdAt") from payment_method where "businessId"='${BHANDARYS}'`);

  test("buying Premium monthly with UPI sets up auto-pay: the plan is ACTIVE and the UPI id is saved as the primary method", async () => {
    test.setTimeout(240_000);
    await chooseMonthly(page, "Premium", "Subscribe");
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await payWithUpiQr(page);
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 60_000 });
    expect(await current()).toMatch(/^ACTIVE\|premium\|MONTHLY$/);
    expect(await ops(`select "autoPay"::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("ACTIVE");
    expect(await methods()).toBe("UPI|UPI testuser@razorpay|true");
    await page.goto(`${ACCOUNT}/payment-methods`);
    await expect(methodRows()).toHaveCount(1);
    await expect(methodRows().first()).toContainText("UPI testuser@razorpay");
    await expect(methodRows().first()).toContainText("Primary");
  });

  test("a card can be added next to a UPI primary", async () => {
    test.setTimeout(240_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    await page.getByTestId("pm-caterly").getByRole("button", { name: "Add payment method" }).click();
    await page.getByRole("menuitem", { name: "Add card" }).click();
    await page.getByRole("checkbox", { name: /I understand and agree/ }).check();
    await page.getByRole("button", { name: "Continue to Razorpay" }).click();
    await completeRazorpayCard(page, RECURRING_CARD);
    await expect(page.getByText(/was saved\. The ₹5/)).toBeVisible({ timeout: 60_000 });
    await expect(methodRows()).toHaveCount(2);
  });

  test("switching from UPI to the card (a subscription that starts in the future) works, and the UPI id is dropped because UPI cannot be a saved secondary", async () => {
    test.setTimeout(240_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    const before = await ops(`select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`);
    await secondaryRow().getByRole("button", { name: "Make primary" }).click();
    await completeRazorpayCard(page, RECURRING_CARD);
    await expect(page.getByText(/is now your primary method/)).toBeVisible({ timeout: 60_000 });
    expect(await ops(`select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).not.toBe(before);
    expect(await methods()).toBe("CARD|Visa ending 4366|true");
    await expect(methodRows()).toHaveCount(1);
  });

  test("switching from a card to UPI (a UPI mandate that starts in the future) works: the UPI id becomes the primary and both cards stay as secondaries", async () => {
    test.setTimeout(300_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    await page.getByTestId("pm-caterly").getByRole("button", { name: "Add payment method" }).click();
    await page.getByRole("menuitem", { name: "Add card" }).click();
    await page.getByRole("checkbox", { name: /I understand and agree/ }).check();
    await page.getByRole("button", { name: "Continue to Razorpay" }).click();
    await completeRazorpayCard(page, RECURRING_CARD);
    await expect(methodRows()).toHaveCount(2, { timeout: 60_000 });
    const before = await ops(`select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`);
    await secondaryRow().getByRole("button", { name: "Make primary" }).click();
    await payWithUpiQr(page);
    await expect(page.getByText(/is now your primary method/)).toBeVisible({ timeout: 60_000 });
    expect(await ops(`select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).not.toBe(before);
    expect(await methods()).toBe("CARD|Visa ending 4366|false;CARD|Visa ending 4366|false;UPI|UPI testuser@razorpay|true");
    await expect(methodRows().first()).toContainText("UPI testuser@razorpay");
    await expect(methodRows().first()).toContainText("Primary");
  });

  test("a UPI setup that is closed before it finishes charges nothing and leaves the plan as it was", async () => {
    test.setTimeout(240_000);
    // Start a plan change to monthly Cross Platform and close Razorpay's window before paying.
    const before = await paid();
    await page.goto(`${STORE}/manage/caterly`);
    await page.getByRole("button", { name: "Monthly" }).click();
    await page.getByRole("article").filter({ hasText: "Cross Platform" }).getByRole("button", { name: "Upgrade" }).click();
    await expect(page.getByRole("button", { name: /^Pay ₹/ })).toBeVisible();
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    const frame = page.frameLocator("iframe.razorpay-checkout-frame");
    await frame.getByPlaceholder("Mobile number").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // The X at the top right of Razorpay's window, as a person would click it, then its "Cancel Payment?" confirmation.
    await page.mouse.click(1109, 98);
    await frame.getByRole("button", { name: /^yes/i }).first().click({ timeout: 8000 }).catch(() => {}); // only if Razorpay asks "Cancel payment?"
    await expect(page.getByText(/auto-pay was not set up|not been charged/)).toBeVisible({ timeout: 30_000 });
    expect(await paid()).toBe(before);
    expect(await current()).toMatch(/^ACTIVE\|premium\|MONTHLY$/);
  });
});

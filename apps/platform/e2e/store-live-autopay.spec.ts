import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * The LIVE Store, monthly auto-pay (step 3b.2): a monthly plan is always auto-renewal, so the Store opens Razorpay's auto-pay window (a subscription for the
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

test.describe("Live Store: monthly auto-pay", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAsBhandarysAdmin(page);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test("buying Premium monthly sets up auto-pay: the first month is paid, the plan is ACTIVE and the card is saved as the primary method", async () => {
    test.setTimeout(240_000);
    const before = Number(await paid());
    // The product sent no owner phone and a stale email: the Store must hand Ops the Admin's phone and email from the Account (the single sign-up) before the Razorpay customer is made.
    ops(`update business set "ownerPhone"=null, "ownerEmail"='stale@product.test' where id='${BHANDARYS}'`);
    await chooseMonthly(page, "Premium", "Subscribe");
    await authoriseAutoPay(page);
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 60_000 });
    expect(Number(await paid())).toBe(before + 1);
    expect(await current()).toMatch(/^ACTIVE\|premium\|MONTHLY$/);
    expect(await ops(`select "autoPay"::text||'|'||(\"razorpaySubscriptionId\" like 'sub_%')::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("ACTIVE|true");
    expect(await ops(`select count(*) from razorpay_customer where "businessId"='${BHANDARYS}'`)).toBe("1");
    expect(await ops(`select "ownerPhone"||'|'||("ownerEmail"<>'stale@product.test')::text from business where id='${BHANDARYS}'`)).toBe("+919800000123|true");
    expect(await ops(`select label from payment_method where "businessId"='${BHANDARYS}'`)).toBe("Visa ending 4366");
  });

  test("the saved method is the primary, the next charge date is known, and the primary cannot be removed", async () => {
    await page.goto(`${STORE}/`);
    const answer = await page.evaluate(async () => {
      const post = async (body: unknown) => {
        const res = await fetch("/api/store/methods", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: res.status, json: await res.json() };
      };
      const list = await post({ action: "list", productKey: "caterly" });
      const id = list.json.methods?.[0]?.id as string | undefined;
      const remove = await post({ action: "remove", productKey: "caterly", methodId: id ?? "pm_missing" });
      return { list, remove };
    });
    expect(answer.list.status).toBe(200);
    expect(answer.list.json.methods).toEqual([expect.objectContaining({ label: "Visa ending 4366", isPrimary: true })]);
    expect(typeof answer.list.json.nextChargeAt).toBe("string");
    expect(answer.remove.status).toBe(400);
    expect(answer.remove.json.message).toMatch(/primary/i);
    expect(await ops(`select count(*) from payment_method where "businessId"='${BHANDARYS}'`)).toBe("1");
  });

  const onPage = (name: string | RegExp) => page.getByTestId("pm-caterly").getByRole("button", { name });
  const methodRows = () => page.getByTestId("method-row");
  // The primary row carries the "Primary" badge; text matching cannot tell it from the secondary row's "Make primary" button.
  const secondaryRow = () => methodRows().filter({ hasNot: page.locator(".pa-badge") });

  test("the Account's Payment method page shows the card as primary and auto-renewal as on", async () => {
    await page.goto(`${ACCOUNT}/payment-methods`);
    await expect(page.getByRole("heading", { name: "Payment method", level: 1 })).toBeVisible();
    await expect(methodRows()).toHaveCount(1);
    await expect(methodRows().first()).toContainText("Visa ending 4366");
    await expect(methodRows().first()).toContainText("Primary");
    await expect(page.getByTestId("auto-renewal")).toContainText("On.");
    await expect(page.getByTestId("pm-caterly")).toContainText(/next charge is on/);
    // The only method is the primary: nothing to remove or make primary.
    await expect(onPage("Remove")).toHaveCount(0);
    await expect(onPage("Make primary")).toHaveCount(0);
  });

  test("the Store points a monthly plan to the Account instead of offering Cancel", async () => {
    await page.goto(`${STORE}/manage/caterly`);
    await expect(page.getByTestId("autopay-note")).toContainText("renews automatically");
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
    await expect(page.getByTestId("autopay-note").getByRole("link")).toHaveAttribute("href", `${ACCOUNT}/payment-methods`);
  });

  test("the Account's Subscriptions page shows the plan like Caterly's old page did: status, billing information, history, and the payment with its invoice", async () => {
    await page.goto(`${ACCOUNT}/subscriptions`);
    await expect(page.getByRole("heading", { name: "Subscriptions", level: 1 })).toBeVisible();
    const caterly = page.getByTestId("subscription-caterly");
    await expect(caterly.getByRole("region", { name: /Current subscription/ })).toContainText("Premium");
    await expect(caterly.getByRole("region", { name: /Current subscription/ })).toContainText("Active");
    await expect(caterly.getByRole("region", { name: "Billing information" })).toContainText("Auto-pay every 30 days");
    await expect(caterly.getByTestId("autopay-status")).toContainText("On, next charge");
    await expect(caterly.getByRole("region", { name: /Subscription history/ })).toContainText("Premium");
    const payments = caterly.getByTestId("payments-list");
    await expect(payments).toContainText("monthly");
    await expect(payments.getByRole("link", { name: "Invoice" }).first()).toHaveAttribute("href", /\/api\/account\/invoices\/.+product=caterly/);
    // "Manage plan" goes to the Store, where plans are changed and paid.
    await expect(caterly.getByTestId("manage-plan")).toHaveAttribute("href", `${STORE}/manage/caterly`);
  });

  test("pause and resume auto-renewal work on the Subscriptions page itself", async () => {
    test.setTimeout(120_000);
    await page.goto(`${ACCOUNT}/subscriptions`);
    await page.getByRole("button", { name: "Pause auto-renewal" }).click();
    await page.getByRole("button", { name: "Yes, pause" }).click();
    await expect(page.getByText("Auto-renewal is paused.")).toBeVisible({ timeout: 30_000 });
    expect(await ops(`select "autoPay"::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("PAUSED");
    // The page reloads itself with the new state.
    await expect(page.getByTestId("autopay-status")).toContainText("Paused", { timeout: 30_000 });
    await page.getByRole("button", { name: "Resume auto-renewal" }).click();
    await expect(page.getByText("Auto-renewal is back on.")).toBeVisible({ timeout: 30_000 });
    expect(await ops(`select "autoPay"::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("ACTIVE");
  });

  test("pausing auto-renewal stops future charges, keeps the paid days, and resuming turns it back on", async () => {
    test.setTimeout(120_000);
    const periodEnd = () => ops(`select "currentPeriodEnd" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`);
    const before = await periodEnd();
    await page.goto(`${ACCOUNT}/payment-methods`);
    await page.getByRole("button", { name: "Pause auto-renewal" }).click();
    await page.getByRole("button", { name: "Yes, pause" }).click();
    await expect(page.getByText("Auto-renewal is paused.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("auto-renewal")).toContainText("Paused.");
    expect(await ops(`select "autoPay"::text||'|'||status::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("PAUSED|ACTIVE");
    expect(await periodEnd()).toBe(before);
    await page.getByRole("button", { name: "Resume auto-renewal" }).click();
    await expect(page.getByText("Auto-renewal is back on.")).toBeVisible({ timeout: 30_000 });
    expect(await ops(`select "autoPay"::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("ACTIVE");
  });

  test("adding a card saves it as a secondary and Ops refunds the Rs 5", async () => {
    test.setTimeout(240_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    await onPage("Add card").click();
    await completeRazorpayCard(page, RECURRING_CARD);
    await expect(page.getByText(/was saved\. The ₹5/)).toBeVisible({ timeout: 60_000 });
    await expect(methodRows()).toHaveCount(2);
    expect(await ops(`select count(*) from payment_method where "businessId"='${BHANDARYS}' and "razorpaySubscriptionId" is null`)).toBe("1");
  });

  test("making the new card primary authorises a new subscription and switches the renewals to it", async () => {
    test.setTimeout(240_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    const oldSub = await ops(`select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`);
    await secondaryRow().getByRole("button", { name: "Make primary" }).click();
    await completeRazorpayCard(page, RECURRING_CARD);
    await expect(page.getByText(/is now your primary method/)).toBeVisible({ timeout: 60_000 });
    const newSub = await ops(`select "razorpaySubscriptionId" from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`);
    expect(newSub).not.toBe(oldSub);
    await expect(methodRows().first()).toContainText("Primary");
    // Both methods are the same test card, so the switch is shown by the primary now being the card that was added second.
    expect(await ops(`select count(*) from payment_method where "businessId"='${BHANDARYS}' and "razorpaySubscriptionId"='${newSub}'`)).toBe("1");
  });

  test("a secondary method can be removed, the primary and the last cannot", async () => {
    test.setTimeout(120_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    await expect(methodRows()).toHaveCount(2);
    await secondaryRow().getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: /^Remove Visa/ }).click();
    await expect(page.getByText("The payment method was removed.")).toBeVisible({ timeout: 30_000 });
    await expect(methodRows()).toHaveCount(1);
    await expect(onPage("Remove")).toHaveCount(0);
    expect(await ops(`select count(*) from payment_method where "businessId"='${BHANDARYS}'`)).toBe("1");
  });

  test("stopping auto-renewal cancels the Razorpay subscription for good and keeps the paid days", async () => {
    test.setTimeout(120_000);
    await page.goto(`${ACCOUNT}/payment-methods`);
    await page.getByRole("button", { name: "Stop auto-renewal" }).click();
    await page.getByRole("button", { name: "Yes, stop auto-renewal" }).click();
    await expect(page.getByText("Auto-renewal is stopped.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("auto-renewal")).toContainText("Stopped.");
    await expect(page.getByRole("button", { name: "Resume auto-renewal" })).toHaveCount(0);
    expect(await ops(`select "autoPay"::text||'|'||status::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("CANCELLED|ACTIVE");
  });

  test("the Old Admin is turned away from the Payment method page", async ({ browser }) => {
    test.setTimeout(120_000);
    // A new person takes over as Admin; the signed-in person becomes the Old Admin (a former_admin row that stays active and read-only).
    const other = await browser.newPage();
    await signInAsBhandarysAdmin(other);
    await other.close();
    await page.goto(`${ACCOUNT}/payment-methods`);
    await expect(page.getByText("Payment methods are available to the business Admin only.")).toBeVisible();
    await expect(page.getByTestId("pm-caterly")).toHaveCount(0);
  });
});

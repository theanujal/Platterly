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
async function authoriseAutoPay(p: Page) {
  await p.getByRole("button", { name: /^Pay ₹/ }).click();
  const frame = p.frameLocator("iframe.razorpay-checkout-frame");
  const mobile = frame.getByPlaceholder("Mobile number");
  if (await mobile.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) await mobile.pressSequentially("9845671203", { delay: 60 });
  await frame.getByText("Cards", { exact: true }).first().click();
  const addCard = frame.getByText("Add a new card");
  if (await addCard.isVisible().catch(() => false)) await addCard.click();
  await frame.locator('input[name="card.number"]').pressSequentially("4718609108204366", { delay: 40 });
  await frame.locator('input[name="card.expiry"]').pressSequentially("1230", { delay: 40 });
  await frame.locator('input[name="card.cvv"]').pressSequentially("123", { delay: 40 });
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
    await chooseMonthly(page, "Premium", "Subscribe");
    await authoriseAutoPay(page);
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 60_000 });
    expect(Number(await paid())).toBe(before + 1);
    expect(await current()).toMatch(/^ACTIVE\|premium\|MONTHLY$/);
    expect(await ops(`select "autoPay"::text||'|'||(\"razorpaySubscriptionId\" like 'sub_%')::text from subscription where "businessId"='${BHANDARYS}' and "endDate" is null`)).toBe("ACTIVE|true");
    expect(await ops(`select count(*) from razorpay_customer where "businessId"='${BHANDARYS}'`)).toBe("1");
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
});

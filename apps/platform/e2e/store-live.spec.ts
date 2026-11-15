import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * The LIVE Store: real plans from Ops, a real Razorpay TEST-mode payment through Razorpay's own checkout window and demo bank page, a failed payment, and an
 * upgrade with credit. (store.spec.ts covers the SAMPLE Store, shown only when OPS_BASE_URL is unset; this spec needs the opposite: Platform with the Ops
 * settings, Ops running on 3200, and internet access to Razorpay's test checkout.)
 *
 * It writes real payments, invoices and audit rows, so it runs ONLY against throwaway copies of the Platform and Ops databases (it refuses otherwise):
 *   DATABASE_URL               = the throwaway Platform copy (the Platform server must use the same one)
 *   OPS_THROWAWAY_DATABASE_URL = the throwaway Ops copy (Ops on 3200 must use the same one)
 * The new test person is made Admin of Bhandarys Kitchen (a trialing business that exists in both databases) the way an Admin transfer leaves things.
 * The tests share one signed-in person and build on each other, so they run in order. The last one demotes that person to Old Admin.
 */
const STORE = "http://store.localhost:3300";
const ACCOUNT = "http://account.localhost:3300";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";

function sql(urlEnv: "DATABASE_URL" | "OPS_THROWAWAY_DATABASE_URL", statement: string): string {
  const url = (process.env[urlEnv] ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error(`store-live.spec.ts refuses to run unless ${urlEnv} is a throwaway copy`);
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
const lastPaid = () => ops(`select total||'|'||coalesce("creditAmount",0)||'|'||coalesce("invoiceNumber",'') from subscription_payment where "businessId"='${BHANDARYS}' and status='PAID' order by "paidAt" desc limit 1`);

const rupees = (text: string | null) => Number((text ?? "").replace(/[^0-9.]/g, ""));

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

test.describe("Live Store", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAsBhandarysAdmin(page);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test("a failed payment charges nothing and leaves the business on its trial", async () => {
    test.setTimeout(180_000);
    const before = await paid();
    await chooseAnnual(page, "Premium", "Subscribe");
    await expect(page.getByTestId("total")).toHaveText(/38,940/);
    await payInRazorpay(page, "Failure");
    // Razorpay keeps its window open on a failed payment so another method can be tried.
    const frame = page.frameLocator("iframe.razorpay-checkout-frame");
    await expect(frame.getByText("Payment could not be completed")).toBeVisible({ timeout: 30_000 });
    // Not covered: the Store's own "Your payment was not completed" line after the person closes Razorpay's window. Razorpay's failed-payment screen layers its
    // save-card offer over the close button and neither a click nor Escape reliably closes it, so the test stops here and checks the money side.
    expect(await paid()).toBe(before);
    expect(await ops(`select status from subscription_payment where "businessId"='${BHANDARYS}' order by "createdAt" desc limit 1`)).not.toBe("PAID");
    expect(await current()).toMatch(/^TRIALING\|trial\|/);
  });

  test("buying Premium yearly pays through Razorpay, confirms, and Ops records an active subscription with an invoice", async () => {
    test.setTimeout(180_000);
    const before = Number(await paid());
    await chooseAnnual(page, "Premium", "Subscribe");
    await expect(page.getByTestId("total")).toHaveText(/38,940/);
    await payInRazorpay(page, "Success");
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible({ timeout: 40_000 });
    expect(Number(await paid())).toBe(before + 1);
    expect(await current()).toMatch(/^ACTIVE\|premium\|ANNUAL$/);
    const [total, credit, invoice] = (await lastPaid()).split("|");
    expect(Number(total)).toBe(38940);
    expect(Number(credit)).toBe(0);
    expect(invoice).toMatch(/\S/);
    await page.goto(`${STORE}/`);
    await expect(page.getByRole("article", { name: "Caterly" })).toContainText("Premium");
  });

  test("upgrading to the dearer plan takes the unused Premium days off the price and Ops records the credit", async () => {
    test.setTimeout(180_000);
    const before = Number(await paid());
    // The details typed for the Premium purchase were saved when it was paid, so this purchase starts with them filled in: nothing is typed here.
    await chooseAnnual(page, "Cross Platform", "Upgrade", false);
    await expect(page.getByLabel("Business name")).toHaveValue("Bhandarys Kitchen");
    await expect(page.getByLabel("Address line 1")).toHaveValue("12 MG Road");
    await expect(page.getByLabel("City")).toHaveValue("Pune");
    await expect(page.getByLabel("State")).toHaveValue("Maharashtra");
    await expect(page.getByLabel("PIN code")).toHaveValue("411001");
    const credit = rupees(await page.getByTestId("credit").textContent());
    const plan = rupees(await page.getByTestId("amount").textContent());
    const total = rupees(await page.getByTestId("total").textContent());
    expect(credit).toBeGreaterThan(30_000); // bought just now: almost the whole year is unused
    expect(credit).toBeLessThanOrEqual(33_000);
    expect(total).toBeCloseTo((plan - credit) * 1.18, 0); // GST is charged on the price after the credit
    await payInRazorpay(page, "Success");
    await expect(page.getByRole("heading", { name: "Upgrade confirmed" })).toBeVisible({ timeout: 40_000 });
    expect(Number(await paid())).toBe(before + 1);
    expect(await current()).toMatch(/^ACTIVE\|cp\|ANNUAL$/);
    const [paidTotal, recordedCredit] = (await lastPaid()).split("|");
    expect(Number(paidTotal)).toBeCloseTo(total, 1);
    expect(Number(recordedCredit)).toBeCloseTo(credit, 1);
  });

  test("the Account's Billing details page shows what the payment saved, and the Admin can correct it with the same checks as the Store", async () => {
    expect(await ops(`select city||'|'||source from billing_customer where "businessId"='${BHANDARYS}'`)).toBe("Pune|payment");
    await page.goto(`${ACCOUNT}/billing-details`);
    await expect(page.getByRole("heading", { name: "Billing details", level: 1 })).toBeVisible();
    await expect(page.getByLabel("City")).toHaveValue("Pune");
    await page.getByLabel("City").fill("Mysuru");
    await page.getByLabel("PIN code").fill("57");
    await page.getByLabel("GSTIN").fill("NOT-A-GSTIN");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter the billing contact person.")).toBeVisible();
    await expect(page.getByText("Enter a 6-digit PIN code.")).toBeVisible();
    await expect(page.getByText("Enter a valid 15-character GSTIN, or leave it blank.")).toBeVisible();
    expect(await ops(`select city from billing_customer where "businessId"='${BHANDARYS}'`)).toBe("Pune");
    await page.getByLabel("PIN code").fill("570001");
    await page.getByLabel("Billing contact person").fill("Asha Bhandary");
    await page.getByLabel("Billing email").fill("accounts@bhandarys.example");
    await page.getByLabel("Billing phone number").fill("98765 43210");
    await page.getByLabel("GSTIN").fill("29aapfu0939f1zv");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Your billing details were saved. New invoices will use them.")).toBeVisible();
    expect(await ops(`select city||'|'||"postalCode"||'|'||gstin||'|'||source from billing_customer where "businessId"='${BHANDARYS}'`)).toBe("Mysuru|570001|29AAPFU0939F1ZV|account");
    await page.reload();
    await expect(page.getByLabel("City")).toHaveValue("Mysuru");
    // Invoices already issued keep the details they were made with.
    expect(await ops(`select "invoiceSnapshot"->'buyer'->>'city' from subscription_payment where "businessId"='${BHANDARYS}' and status='PAID' order by "paidAt" limit 1`)).toBe("Pune");
  });

  test("the Store checkout then starts with the details the Admin saved in the Account", async () => {
    await page.goto(`${STORE}/manage/caterly`);
    // A downgrade shows the same billing form as a purchase, which is all this test needs; nothing is confirmed.
    await page.getByRole("article").filter({ hasText: "Premium" }).getByRole("button", { name: "Downgrade" }).click();
    await expect(page.getByLabel("City")).toHaveValue("Mysuru");
    await expect(page.getByLabel("PIN code")).toHaveValue("570001");
    await expect(page.getByLabel("GSTIN (optional)")).toHaveValue("29AAPFU0939F1ZV");
  });

  test("the Store home is live and does not claim that payment is unavailable", async () => {
    await page.goto(`${STORE}/`);
    await expect(page.getByRole("note")).toContainText("live from Platterly");
    await expect(page.getByRole("note")).not.toContainText("Payment is not connected");
    await expect(page.getByRole("article", { name: "Caterly" })).toBeVisible();
  });

  test("the Old Admin buys nothing and sees no billing, no invoices and no billing details, whatever address they ask for", async ({ browser }) => {
    test.setTimeout(120_000);
    // A new person takes over as Admin; the signed-in person becomes the Old Admin (a former_admin row that stays active and read-only).
    const other = await browser.newPage();
    await signInAsBhandarysAdmin(other);
    await other.close();
    expect(await sql("DATABASE_URL", `select count(*) from organisation_members where organisation_id='${BHANDARYS}' and central_role='former_admin' and status='active'`)).toMatch(/^[1-9]/);

    await page.goto(`${ACCOUNT}/billing-details`);
    await expect(page.getByText("Billing details are available to the business Admin only.")).toBeVisible();
    await expect(page.getByLabel("City")).toHaveCount(0);
    await page.goto(`${ACCOUNT}/invoices`);
    await expect(page.getByText("Billing is available to the business Admin only.")).toBeVisible();
    await page.goto(`${ACCOUNT}/payments`);
    await expect(page.getByText("Billing is available to the business Admin only.")).toBeVisible();
    await page.goto(`${STORE}/`);
    await expect(page.getByRole("alert")).toContainText("Plans and payments are managed by your business's Admin");
    // The Store still lists its catalogue, as it does for anyone without access; what must not appear is this business's own subscription.
    await expect(page.getByText("Next renewal")).toHaveCount(0);
    await expect(page.getByText("Cross Platform")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Subscribed products", exact: true })).not.toHaveAttribute("aria-selected", "true");

    // The doors behind the pages refuse as well.
    const get = await page.request.get(`${ACCOUNT}/api/account/billing-profile`);
    expect(get.status()).toBe(403);
    expect(await get.json()).not.toHaveProperty("buyer");
    const put = await page.request.put(`${ACCOUNT}/api/account/billing-profile`, { headers: { origin: ACCOUNT }, data: { name: "Hijack", addressLine1: "1 Road", city: "Pune", state: "Maharashtra", postalCode: "411001" } });
    expect(put.status()).toBe(403);
    expect(await ops(`select name from billing_customer where "businessId"='${BHANDARYS}'`)).toBe("Bhandarys Kitchen");
    expect((await page.request.get(`${ACCOUNT}/api/account/billing`)).status()).toBe(200);
    expect(await (await page.request.get(`${ACCOUNT}/api/account/billing`)).json()).toEqual({ status: "not_admin" });
    const paidId = await ops(`select id from subscription_payment where "businessId"='${BHANDARYS}' and status='PAID' order by "paidAt" limit 1`);
    expect((await page.request.get(`${ACCOUNT}/api/account/invoices/${paidId}?product=caterly`)).status()).toBe(404);
    for (const route of ["checkout", "quote", "verify", "change"]) {
      const res = await page.request.post(`${STORE}/api/store/${route}`, { headers: { origin: STORE }, data: { productKey: "caterly", planId: "x", interval: "ANNUAL", change: "cancel", razorpayOrderId: "o", razorpayPaymentId: "p", signature: "s", name: "x" } });
      expect(res.status(), route).toBe(403);
    }
    expect(Number(await paid())).toBe(2);
  });
});

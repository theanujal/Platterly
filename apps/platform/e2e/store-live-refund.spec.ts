import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * Asking for a refund (plan slice R2, 2026-11-15): the business Admin sees "Request a refund" on a paid payment in the Account's Subscriptions page, gives a
 * reason, and the request reaches Ops as PENDING; the payment then shows "Refund requested" and cannot be asked for again; once Ops turns it down the button
 * returns. A payment is seeded straight into Ops (no Razorpay needed). Throwaway copies of the Platform and Ops databases only (it refuses otherwise):
 * DATABASE_URL = the Platform copy, OPS_THROWAWAY_DATABASE_URL = the Ops copy.
 */
const ACCOUNT = "http://account.localhost:3300";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";
const PAY = "pay_e2erefund0000000000000000000001";

function sql(urlEnv: "DATABASE_URL" | "OPS_THROWAWAY_DATABASE_URL", statement: string): string {
  const url = (process.env[urlEnv] ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error(`store-live-refund.spec.ts refuses to run unless ${urlEnv} is a throwaway copy`);
  try {
    return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`psql failed: ${String((error as { stderr?: string }).stderr ?? "").trim()}`);
  }
}
const ops = (statement: string) => sql("OPS_THROWAWAY_DATABASE_URL", statement);

async function signInAsBhandarysAdmin(page: Page): Promise<string> {
  const email = newEmail();
  await registerAndSignIn(page, email, `${ACCOUNT}/subscriptions`, "Refund Admin");
  await expect(page).toHaveURL(`${ACCOUNT}/subscriptions`);
  const linked = sql("DATABASE_URL", `begin; update organisation_members set central_role='former_admin' where organisation_id='${BHANDARYS}' and central_role='admin' and status='active'; insert into organisation_members (organisation_id, user_id, central_role) select '${BHANDARYS}', id, 'admin' from users where email='${email}'; commit; select count(*) from organisation_members m join users u on u.id=m.user_id where m.organisation_id='${BHANDARYS}' and m.central_role='admin' and m.status='active' and u.email='${email}'`);
  expect(linked.split("\n").pop()).toBe("1");
  return email;
}

test.describe.configure({ mode: "serial" });

test("the Admin asks for a refund on a paid payment, it is pending in Ops, and cannot be asked twice", async ({ page }) => {
  ops(`delete from refund_request where "paymentId"='${PAY}'; delete from subscription_payment where id='${PAY}'`);
  ops(`insert into subscription_payment (id, "businessId", "productKey", "planId", interval, amount, "gstPercent", "gstAmount", total, status, "razorpayPaymentId", "invoiceNumber", "paidAt") select '${PAY}', '${BHANDARYS}', 'catering', p.id, 'ANNUAL', 1000, 18, 180, 1180, 'PAID', 'pay_rzp_e2erefund1', 'E2E-REFUND-1', now() from plan p where p."productKey"='catering' and p."isTrial"=false limit 1`);
  try {
    await signInAsBhandarysAdmin(page);
    await page.goto(`${ACCOUNT}/subscriptions`);
    const row = page.getByTestId(`refund-${PAY}`);
    await expect(row.getByRole("button", { name: "Request a refund" })).toBeVisible();

    await row.getByRole("button", { name: "Request a refund" }).click();
    await expect(row.getByRole("button", { name: "Send request" })).toBeDisabled();
    await row.getByLabel("Why are you asking for a refund?").fill("We are closing the kitchen");
    await row.getByRole("button", { name: "Send request" }).click();

    await expect(row.getByText("Refund requested")).toBeVisible();
    await expect(row.getByRole("button", { name: "Request a refund" })).toHaveCount(0);
    expect(ops(`select status || '|' || reason from refund_request where "paymentId"='${PAY}'`)).toBe("PENDING|We are closing the kitchen");

    // The state is Ops's, so it survives a reload.
    await page.reload();
    await expect(page.getByTestId(`refund-${PAY}`).getByText("Refund requested")).toBeVisible();

    // Staff turn it down: the owner sees it and may ask again.
    ops(`update refund_request set status='REJECTED', "decidedAt"=now() where "paymentId"='${PAY}'`);
    await page.reload();
    await expect(page.getByTestId(`refund-${PAY}`).getByText("Refund declined")).toBeVisible();
    await expect(page.getByTestId(`refund-${PAY}`).getByRole("button", { name: "Request a refund" })).toBeVisible();
  } finally {
    ops(`delete from refund_request where "paymentId"='${PAY}'; delete from subscription_payment where id='${PAY}'`);
  }
});

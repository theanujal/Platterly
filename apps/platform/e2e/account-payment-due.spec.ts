import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * A failed monthly auto-pay renewal reads "Payment due" (plan slice R4, 2026-11-15) in the Account's Subscriptions page and in the Store's Manage page, with its own
 * wording, instead of looking like a healthy plan; a healthy auto-pay does not. The subscription is seeded straight into Ops. Throwaway copies of the Platform and
 * Ops databases only (it refuses otherwise): DATABASE_URL = the Platform copy, OPS_THROWAWAY_DATABASE_URL = the Ops copy.
 */
const ACCOUNT = "http://account.localhost:3300";
const STORE = "http://store.localhost:3300";
const BHANDARYS = "biz_0018e7f46f574908a6d42da6e1d6ca85";
const FAILED = "Your last payment did not go through. Update your payment method or pay again to keep your plan.";

function sql(urlEnv: "DATABASE_URL" | "OPS_THROWAWAY_DATABASE_URL", statement: string): string {
  const url = (process.env[urlEnv] ?? "").replace(/\?.*$/, "");
  if (!/throwaway/.test(url)) throw new Error(`account-payment-due.spec.ts refuses to run unless ${urlEnv} is a throwaway copy`);
  try {
    return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw new Error(`psql failed: ${String((error as { stderr?: string }).stderr ?? "").trim()}`);
  }
}
const ops = (statement: string) => sql("OPS_THROWAWAY_DATABASE_URL", statement);
/** Makes the business's current Ops subscription a paid monthly plan whose period ended a day ago, with the given auto-pay state. */
const seed = (autoPay: string) => ops(`update subscription set "planId"=(select id from plan where "productKey"='catering' and name='Cross Platform'), status='ACTIVE', "billingInterval"='MONTHLY', "trialEndsAt"=null, "currentPeriodEnd"=(now() at time zone 'utc') - interval '1 day', "razorpaySubscriptionId"='sub_e2e_due', "autoPay"='${autoPay}', "cancelledAt"=null where "businessId"='${BHANDARYS}' and "endDate" is null`);

async function signInAsBhandarysAdmin(page: Page): Promise<void> {
  const email = newEmail();
  await registerAndSignIn(page, email, `${ACCOUNT}/subscriptions`, "Due Admin");
  await expect(page).toHaveURL(`${ACCOUNT}/subscriptions`);
  const linked = sql("DATABASE_URL", `begin; update organisation_members set central_role='former_admin' where organisation_id='${BHANDARYS}' and central_role='admin' and status='active'; insert into organisation_members (organisation_id, user_id, central_role) select '${BHANDARYS}', id, 'admin' from users where email='${email}'; commit; select count(*) from organisation_members m join users u on u.id=m.user_id where m.organisation_id='${BHANDARYS}' and m.central_role='admin' and m.status='active' and u.email='${email}'`);
  expect(linked.split("\n").pop()).toBe("1");
}

test("a failed auto-pay renewal reads Payment due in the Account and the Store; a healthy one does not", async ({ page }) => {
  await signInAsBhandarysAdmin(page);

  seed("PENDING");
  await page.goto(`${ACCOUNT}/subscriptions`);
  const card = page.getByTestId("subscription-caterly");
  await expect(card.getByText("Payment due").first()).toBeVisible();
  await expect(card).toContainText(FAILED);
  await expect(card).toContainText("We will try your payment method again.");
  // The page also says what the plan costs (this interval, GST included) and what it includes, from Ops's plan list (cleanup, AJ 2026-11-15).
  await expect(card.getByTestId("plan-price")).toHaveText("₹5,898.82 a month, GST included");
  await expect(card.getByTestId("plan-includes")).toContainText("everything upcoming");

  await page.goto(`${STORE}/manage/caterly`);
  await expect(page.getByRole("alert").filter({ hasText: "Payment due" })).toContainText(FAILED);

  // Razorpay gave up: still Payment due, no promise of a retry.
  seed("HALTED");
  await page.goto(`${ACCOUNT}/subscriptions`);
  await expect(page.getByTestId("subscription-caterly")).toContainText(FAILED);
  await expect(page.getByTestId("subscription-caterly")).not.toContainText("We will try your payment method again.");

  // A healthy auto-pay inside its period is just Active.
  ops(`update subscription set "currentPeriodEnd"=(now() at time zone 'utc') + interval '20 days', "autoPay"='ACTIVE' where "businessId"='${BHANDARYS}' and "endDate" is null`);
  await page.goto(`${ACCOUNT}/subscriptions`);
  await expect(page.getByTestId("subscription-caterly")).not.toContainText("Payment due");
  await expect(page.getByTestId("subscription-caterly")).not.toContainText(FAILED);
});

import { expect, test } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * Store sign-in and single sign-on, in a real browser against the running Platform (auth, account and store hosts), its identity database and the
 * local mail sink. Nothing is faked: a new person registers through the pages.
 */
const STORE = "http://store.localhost:3300";
const ACCOUNT = "http://account.localhost:3300";

test.describe("Store sign-in", () => {
  test("the Store home is public and offers Sign in; a signed-out visit to Manage is sent to the central sign-in page", async ({ page }) => {
    await page.goto(`${STORE}/`);
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto(`${STORE}/manage/caterly`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  });

  test("signing in through the Store signs the person in to the Account with no second prompt, and Sign out ends both", async ({ page, context }) => {
    // Register and sign in through the Store: this also creates the central (auth host) session.
    await registerAndSignIn(page, newEmail(), `${STORE}/manage/caterly`, "Store Person");
    await expect(page).toHaveURL(`${STORE}/manage/caterly`);
    await expect(page.getByRole("heading", { level: 1, name: "Manage your Caterly subscription" })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Store Person");

    // Single sign-on: the Account opens without asking for credentials.
    await page.goto(`${ACCOUNT}/`);
    await expect(page).toHaveURL(`${ACCOUNT}/`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);

    // Each host keeps its own cookie; neither is sent to the other host.
    const names = async (host: string) => (await context.cookies()).filter((c) => c.domain === host || c.domain === `.${host}`).map((c) => c.name);
    expect(await names("store.localhost")).toContain("platterly_store_session");
    expect(await names("store.localhost")).not.toContain("platterly_account_session");
    expect(await names("account.localhost")).not.toContain("platterly_store_session");

    // Signing out of the Store ends the central session, so the Account needs a sign-in again.
    await page.goto(`${STORE}/`);
    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto(`${ACCOUNT}/`);
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  });

  test("signing in to the Account signs the person in to the Store with no second prompt", async ({ page }) => {
    await registerAndSignIn(page, newEmail(), `${ACCOUNT}/`, "Account Person");
    await expect(page).toHaveURL(`${ACCOUNT}/`);
    await page.goto(`${STORE}/manage/caterly`);
    await expect(page).toHaveURL(`${STORE}/manage/caterly`);
    await expect(page.getByRole("banner")).toContainText("Account Person");
  });
});

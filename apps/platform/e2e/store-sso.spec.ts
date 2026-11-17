import { expect, test } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

/**
 * Store sign-in and single sign-on, in a real browser against the running Platform (auth, account and store hosts), its identity database and the
 * local mail sink. Nothing is faked: a new person registers through the pages.
 */
const STORE = "http://store.localhost:3300";
const ACCOUNT = "http://account.localhost:3300";

test.describe("Store sign-in", () => {
  test("the Store is never public: a signed-out visit to the home or Manage is sent to the central sign-in page, and crawlers are told to stay away", async ({ page, request }) => {
    for (const path of ["/", "/manage/caterly"]) {
      await page.goto(`${STORE}${path}`);
      await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
    }
    const robots = await request.get(`${STORE}/robots.txt`);
    expect(await robots.text()).toMatch(/Disallow: \//);
    expect((await request.get(`${STORE}/`, { maxRedirects: 0 })).headers()["x-robots-tag"]).toContain("noindex");
  });

  test("signing in through the Store signs the person in to the Account with no second prompt, and Sign out ends both", async ({ page, context }) => {
    // Register and sign in through the Store: this also creates the central (auth host) session.
    await registerAndSignIn(page, newEmail(), `${STORE}/manage/caterly`, "Store Person");
    await expect(page).toHaveURL(`${STORE}/manage/caterly`);
    // A new person has no business yet, so Manage asks them to set one up first (the purchase screen needs a business).
    await expect(page.getByRole("heading", { level: 1, name: "Set up your business first" })).toBeVisible();
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
    await page.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
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

  test("a person with no business yet sees a clear message on the Store home and on Manage, not someone else's subscriptions or a purchase screen", async ({ page }) => {
    await registerAndSignIn(page, newEmail(), `${STORE}/`, "No Business");
    await expect(page).toHaveURL(`${STORE}/`);
    await expect(page.getByRole("alert").filter({ hasText: "You have not set up a business yet" })).toBeVisible();
    // A click before the page is interactive is lost, so click until the tab is really selected.
    const subscribed = page.getByRole("tab", { name: /^Subscribed products/ });
    await expect(async () => {
      await subscribed.click();
      await expect(subscribed).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
    }).toPass();
    await expect(page.getByText("No subscribed products yet.")).toBeVisible();
    await page.goto(`${STORE}/manage/caterly`);
    await expect(page.getByRole("heading", { name: "Set up your business first" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  });

  test("the Store header shows the person's profile photo, and the photo can be read on the Store host but never changed there", async ({ page }) => {
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await registerAndSignIn(page, newEmail(), `${STORE}/manage/caterly`, "Photo Person");
    await expect(page).toHaveURL(`${STORE}/manage/caterly`);
    await expect(page.getByRole("banner")).toContainText("Photo Person");
    await expect(page.getByRole("banner").locator("img.pd-photo")).toHaveCount(0); // no photo yet: initials
    await page.goto(`${ACCOUNT}/`);
    await expect(page).toHaveURL(`${ACCOUNT}/`); // single sign-on finished
    expect((await page.request.put(`${ACCOUNT}/api/account/photo`, { headers: { origin: ACCOUNT }, data: PNG })).status()).toBe(200);
    await page.goto(`${STORE}/`);
    const img = page.getByRole("banner").locator("img.pd-photo");
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0); // the image really loaded
    expect((await page.request.put(`${STORE}/api/account/photo`, { headers: { origin: STORE }, data: PNG })).status()).toBe(404); // no change from the Store
  });

  test("the Store's pay routes refuse a signed-out caller, another site's page, and any host but the Store", async ({ request }) => {
    for (const path of ["/api/store/checkout", "/api/store/verify", "/api/store/quote", "/api/store/change"]) {
      // Signed out, from the Store's own page: 401. From another site: 403 before anything else is looked at. On the Account host: not there.
      expect((await request.post(`${STORE}${path}`, { headers: { origin: STORE }, data: {} })).status(), path).toBe(401);
      expect((await request.post(`${STORE}${path}`, { headers: { origin: "https://evil.example" }, data: {} })).status(), path).toBe(403);
      expect((await request.post(`${STORE}${path}`, { data: {} })).status(), `${path} without an origin`).toBe(403);
      expect((await request.post(`${ACCOUNT}${path}`, { headers: { origin: ACCOUNT }, data: {} })).status(), `${path} on the account host`).toBe(404);
    }
  });
});

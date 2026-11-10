import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Account, connected to real data. A signed-out visitor to any Account page is sent to the sign-in page (the real sign-in journey is auth.spec.ts), and
 * those tests hit the real server with nothing intercepted. The data states (a business, no business, no access, an error) are shown by intercepting
 * the browser's request to /api/account/overview with a test-side response; the server step only checks that a session cookie is PRESENT (its value
 * is not trusted there), so those tests carry a placeholder cookie. That intercept and cookie live only in this file; they give the running app no
 * user. Set ACCOUNT_SHOTS=<dir> to also save a screenshot of each screen and state.
 */
const SHOTS = process.env.ACCOUNT_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

const PAGES = [
  { path: "/", h1: "Welcome back" },
  { path: "/products", h1: "My Products" },
  { path: "/profile", h1: "My Profile" },
  { path: "/security", h1: "Security" },
  { path: "/devices", h1: "Devices and activity" },
  { path: "/notifications", h1: "Notifications" },
];
const switcher = (page: Page) => page.getByRole("button", { name: /Switch product/ });
const nav = (page: Page) => page.getByRole("navigation", { name: "Account" });
const OVERVIEW = "**/api/account/overview";
/** Presence only: lets the server step render the page so the intercepted overview call decides what it shows. */
const withPlaceholderSession = (context: BrowserContext) => context.addCookies([{ name: "platterly_account_session", value: "placeholder", url: "http://account.localhost:3300" }]);
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** The profile screen reads its own stored details from /api/account/profile; these tests answer that call with a test-side profile too. */
const PROFILE = { name: "Owner Kitchen", firstName: "Owner", lastName: "Kitchen", email: "owner@kitchen.test", emailVerified: true, phone: "+919800000123", timeZone: "Asia/Kolkata", notifyProductUpdates: false };
const mockProfile = (page: Page) => page.route("**/api/account/profile", (r) => json(r, 200, { status: "ok", profile: PROFILE, timeZones: ["Asia/Kolkata", "Asia/Dubai"] }));
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "owner@kitchen.test", emailVerified: true };
const BIZ = { id: "biz_" + "a".repeat(32), name: "Test Kitchen Co", status: "active", role: "Admin" };
const okBody = (products = { caterly: "linked", rivo: "none" }, business = BIZ) => ({ status: "ok", overview: { user: USER, business: { state: "ok", business, products, team: [] } } });

test.describe("Running app: signed out (no intercept)", () => {
  for (const p of PAGES) {
    test(`${p.path} sends a signed-out visitor to the sign-in page and shows no Account content or invented person`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Account" })).toHaveCount(0);
      await expect(page.getByText(/Meera|Kapoor|Spice Route|example\.com|Sample data|sample data/)).toHaveCount(0);
      await shot(page, `running-app${p.path === "/" ? "-overview" : p.path.replace("/", "-")}`);
    });
  }

  test("the API answers 401 with no body details, and no header, cookie or query string can name a user", async ({ request }) => {
    const bare = await request.get("/api/account/overview");
    expect(bare.status()).toBe(401);
    expect(await bare.json()).toEqual({ status: "unauthenticated" });
    expect(bare.headers()["cache-control"]).toBe("no-store");
    for (const attempt of [
      { url: "/api/account/overview?userId=11111111-1111-4111-8111-111111111111&organisationId=biz_x" },
      { url: "/api/account/overview", headers: { "x-user-id": "11111111-1111-4111-8111-111111111111", authorization: "Bearer test", "x-test-session": "1" } },
      { url: "/api/account/overview", headers: { cookie: "session=1; platterly_session=1; userId=11111111-1111-4111-8111-111111111111" } },
    ]) {
      expect((await request.get(attempt.url, { headers: attempt.headers })).status(), JSON.stringify(attempt)).toBe(401);
    }
  });

  test("a signed-out visit makes no Account API call and no write request", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.host === "account.localhost:3300" && u.pathname.startsWith("/api/")) calls.push(`${r.method()} ${u.pathname}`);
    });
    for (const p of PAGES) await page.goto(p.path);
    expect(calls).toEqual([]);
  });

  test("a stale or forged cookie shows the page shell, then the overview answer 401 sends the visitor to sign in", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await page.goto("/profile");
    await expect(page).toHaveURL(/auth\.localhost:3300\/sign-in\?/);
  });
});

test.describe("Product switcher", () => {
  test("lists the products, switches, closes on Escape, and the choice survives moving between pages and a reload", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await page.route(OVERVIEW, (r) => json(r, 200, okBody()));
    await page.goto("/");
    await expect(switcher(page)).toContainText("Caterly");
    await switcher(page).click();
    const list = page.getByRole("listbox", { name: "Your products" });
    await expect(list.getByRole("option")).toHaveCount(2);
    await expect(list.getByRole("option", { name: /Caterly/ })).toHaveAttribute("aria-selected", "true");
    await expect(list.getByRole("option", { name: /Rivo/ })).toContainText("Coming soon");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await switcher(page).click();
    await list.getByRole("button", { name: /Rivo/ }).click();
    await expect(switcher(page)).toContainText("Rivo");
    await nav(page).getByRole("link", { name: "Security" }).click();
    await expect(switcher(page)).toContainText("Rivo");
    await page.reload();
    await expect(switcher(page)).toContainText("Rivo");
  });
});

test.describe("Data states (the browser's request is intercepted; the running app cannot be given a user)", () => {
  test.beforeEach(async ({ context }) => {
    await withPlaceholderSession(context);
  });

  test("a business: overview, business, products, profile and security show the real fields and nothing invented", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 200, okBody()));

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: USER.email })).toBeVisible();
    await expect(page.locator(".pa-acct-chip")).toContainText(USER.email);
    await expect(switcher(page)).toContainText(BIZ.name);
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText(`For ${BIZ.name}`);
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText("Linked");
    await expect(page.getByRole("article", { name: "Rivo", exact: true })).toContainText("Coming soon");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
    await shot(page, "data-overview");

    expect((await page.request.get("/business")).status()).toBe(404);

    await page.goto("/products");
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toHaveAttribute("data-selected", "true");
    await switcher(page).click();
    await page.getByRole("listbox", { name: "Your products" }).getByRole("button", { name: /Rivo/ }).click();
    await expect(page.getByRole("article", { name: "Rivo", exact: true })).toHaveAttribute("data-selected", "true");
    await shot(page, "data-products");

    await mockProfile(page);
    await page.goto("/profile");
    await expect(page.getByLabel("Email")).toHaveValue(USER.email);
    await expect(page.getByLabel("First name")).toHaveValue("Owner");
    await expect(page.getByLabel("Last name")).toHaveValue("Kitchen");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 98000 00123");
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeEnabled();
    await shot(page, "data-profile");

    await page.goto("/security");
    await expect(page.getByText(USER.email).first()).toBeVisible();
    await shot(page, "data-security");
    await page.goto("/devices");
    await expect(page.getByText("Chrome on a laptop")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out everywhere" })).toBeDisabled();
    await shot(page, "data-devices");
  });

  test("every control that would write is disabled and says why", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 200, okBody({ caterly: "none", rivo: "none" })));
    await page.goto("/products");
    await expect(page.getByRole("button", { name: /Set up Caterly/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Notify me/ })).toBeDisabled();
    await page.route(OVERVIEW, (r) => json(r, 200, okBody()));
    await page.goto("/products");
    await expect(page.getByRole("button", { name: /Open Caterly/ })).toBeDisabled();
  });

  test("a suspended business and link are labelled as suspended", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 200, okBody({ caterly: "suspended", rivo: "none" }, { ...BIZ, status: "suspended" })));
    await page.goto("/products");
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText("suspended");
  });

  test("no business: every business page shows the empty state, the profile still shows", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 200, { status: "ok", overview: { user: USER, business: { state: "none" } } }));
    for (const p of ["/products"]) {
      await page.goto(p);
      await expect(page.getByRole("region", { name: "No business yet" })).toBeVisible();
    }
    await page.goto("/");
    await expect(page.getByRole("heading", { name: USER.email })).toBeVisible();
    await expect(page.getByRole("region", { name: "No business yet" })).toBeVisible();
    await expect(switcher(page)).toContainText("No business yet");
    await shot(page, "state-empty-overview");
    await mockProfile(page);
    await page.goto("/profile");
    await expect(page.getByLabel("Email")).toHaveValue(USER.email);
  });

  test("forbidden: a former Admin sees a no-access panel and no business details", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 200, { status: "ok", overview: { user: USER, business: { state: "forbidden", reason: "member_disabled" } } }));
    await page.goto("/products");
    await expect(page.getByRole("region", { name: "You no longer have access to this business" })).toBeVisible();
    await expect(page.getByText("Your Admin access to the business has ended.")).toBeVisible();
    await expect(page.getByText(BIZ.name)).toHaveCount(0);
    await shot(page, "state-forbidden-business");
  });

  test("error: a server error and a network failure both show a generic message", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 500, { status: "error" }));
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "We could not load your account" })).toBeVisible();
    await expect(page.locator(".pa-acct-chip")).toContainText("Account unavailable");
    await shot(page, "state-error-profile");
    await page.unroute(OVERVIEW);
    await page.route(OVERVIEW, (r) => r.abort());
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "We could not load your account" })).toBeVisible();
    await page.unroute(OVERVIEW);
    await page.route(OVERVIEW, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "not json" }));
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "We could not load your account" })).toBeVisible();
  });

  test("loading: the page shows a loading panel until the answer arrives", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(OVERVIEW, async (r) => {
      await gate;
      await json(r, 200, okBody());
    });
    await page.goto("/products");
    await expect(page.getByRole("status", { name: "Loading your account" })).toBeVisible();
    await shot(page, "state-loading-business");
    release();
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading your account" })).toHaveCount(0);
  });
});

test.describe("Host routing is unchanged", () => {
  test("the auth host still answers with its placeholder and not the Account (the store host has its own spec, store.spec.ts)", async ({ page }) => {
    for (const kind of ["auth"]) {
      await page.goto(`http://${kind}.localhost:3300/`);
      await expect(page.getByText(`Platterly ${kind}`, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Welcome back/ })).toHaveCount(0);
    }
  });

  test("the Account pages answer 404 on the auth and store hosts and on a bare or unknown host", async ({ request }) => {
    for (const host of ["auth.localhost:3300", "store.localhost:3300"]) {
      for (const path of ["/products", "/profile", "/security", "/devices", "/notifications"]) {
        expect((await request.get(`http://${host}${path}`)).status(), `${host}${path}`).toBe(404);
      }
    }
    for (const url of ["http://localhost:3300/", "http://127.0.0.1:3300/", "http://localhost:3300/profile", "http://ops.localhost:3300/"]) {
      expect((await request.get(url)).status(), url).toBe(404);
    }
    expect((await request.get("http://localhost:3300/api/health")).status()).toBe(200);
    expect((await request.get("http://account.localhost:3300/api/health")).status()).toBe(200);
  });
});

test.describe("Account API host routing", () => {
  test("the overview API answers 404 off the account host", async ({ request }) => {
    for (const host of ["auth.localhost:3300", "store.localhost:3300", "localhost:3300"]) {
      expect((await request.get(`http://${host}/api/account/overview`)).status(), host).toBe(404);
    }
  });
});

test.describe("Phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("has a bottom navigation and no sideways scrolling, with no business and with a business", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await mockProfile(page);
    for (const mode of ["no-business", "business"]) {
      await page.unroute(OVERVIEW).catch(() => {});
      await page.route(OVERVIEW, (r) => json(r, 200, mode === "business" ? okBody() : { status: "ok", overview: { user: USER, business: { state: "none" } } }));
      for (const p of ["/", "/products", "/profile", "/security"]) {
        await page.goto(p);
        await expect(nav(page).getByRole("link", { name: "Products" })).toBeVisible();
        await expect(nav(page).getByRole("link", { name: "Security" })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal overflow on ${p} (${mode})`).toBeLessThanOrEqual(0);
        const box = await nav(page).boundingBox();
        expect(box!.y + box!.height).toBeGreaterThan(844 - 2);
      }
    }
    await shot(page, "phone-products-business");
  });
});

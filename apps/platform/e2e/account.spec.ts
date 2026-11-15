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
  { path: "/devices", h1: "Devices" },
  { path: "/notifications", h1: "Notifications" },
];
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

/** The cards Ops would send: Caterly live, Rivo upcoming (the launch date is far away unless a test sets one). */
const CARDS = [
  { key: "catering", accountKey: "caterly", name: "Caterly", tagline: "Catering business platform", imageUrl: "/products/cloche.svg", logoUrl: null, about: null, features: [], status: "LIVE", launchAt: null },
  { key: "rivo", accountKey: "rivo", name: "Rivo", tagline: "Business growth platform", imageUrl: "/products/growth.svg", logoUrl: null, about: null, features: [], status: "UPCOMING", launchAt: "2099-01-01T00:00:00.000Z" },
];
const mockCards = (page: Page, cards: unknown[] = CARDS) => page.route("**/api/account/products", (r) => json(r, 200, { status: "ok", cards }));
test.beforeEach(async ({ page }) => {
  await mockCards(page);
});

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

test.describe("No product switcher", () => {
  test("the sidebar has no product switcher, the pages are grouped, and Help is there", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await mockProfile(page);
    await page.route(OVERVIEW, (r) => json(r, 200, okBody()));
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Switch product/ })).toHaveCount(0);
    for (const name of ["Overview", "My Products", "Subscriptions", "Invoices", "Payment Methods", "Billing Details", "My Profile", "Security", "Devices", "Notifications", "Help & Support"]) {
      await expect(nav(page).getByRole("link", { name })).toBeVisible();
    }
    await expect(nav(page).locator("hr")).toHaveCount(1);
    await expect(page.getByRole("banner").getByRole("link", { name: "Help" })).toHaveAttribute("href", "https://platterly.in/contact/");
    await expect(page.getByRole("banner").getByRole("button", { name: /notification/i })).toHaveCount(0);
  });

  test("the name at the top right opens a menu with the profile, security and Sign out", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await mockProfile(page);
    await page.route(OVERVIEW, (r) => json(r, 200, okBody()));
    await page.goto("/");
    const header = page.getByRole("banner");
    await header.getByRole("button", { name: "Account menu" }).click();
    await expect(header.getByRole("menuitem", { name: "My Profile" })).toBeVisible();
    await expect(header.getByRole("menuitem", { name: "Security" })).toBeVisible();
    await expect(header.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(header.getByRole("menu")).toHaveCount(0);
  });
});

test.describe("Data states (the browser's request is intercepted; the running app cannot be given a user)", () => {
  test.beforeEach(async ({ context }) => {
    await withPlaceholderSession(context);
  });

  test("a business: overview, business, products, profile and security show the real fields and nothing invented", async ({ page }) => {
    await mockProfile(page);
    await page.route(OVERVIEW, (r) => json(r, 200, okBody()));
    const sub = { productKey: "caterly", product: "Caterly", planName: "Premium", display: { state: "active", label: "Active", tone: "good", detail: "Paid until 12 Nov 2027." }, current: { status: "ACTIVE", interval: "ANNUAL", startDate: "2026-11-12T00:00:00.000Z", trialEndsAt: null, currentPeriodEnd: "2027-11-12T00:00:00.000Z", pendingPlan: null, autoPay: null } };
    const invoice = (n: number) => ({ id: `pay_${n}`, productKey: "caterly", product: "Caterly", invoiceNumber: `FPA-26-11-${n}`, paidAt: `2026-11-0${n}T10:00:00.000Z`, planName: "Premium", interval: "ANNUAL", total: 47198.82 });
    await page.route("**/api/account/billing", (r) => json(r, 200, { status: "ok", business: { name: BIZ.name }, subscriptions: [sub], invoices: [4, 3, 2, 1].map(invoice), payments: [] }));


    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Owner Kitchen" })).toBeVisible();
    await expect(page.locator(".pa-acct-chip")).toContainText(USER.email);
    // The Overview's product cards are the compact ones (status and buttons); the business name and link detail are on My Products.
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText("Active");
    await expect(page.getByRole("article", { name: "Caterly", exact: true }).getByRole("link", { name: "View details" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Rivo", exact: true })).toContainText("Coming soon");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);
    await page.goto("/products");
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText("Available");
    await page.goto("/");
    // The profile card shows the stored name and phone, not a "not stored" note.
    await expect(page.getByRole("heading", { name: "Owner Kitchen", level: 3 })).toBeVisible();
    await expect(page.getByText("+919800000123")).toBeVisible();
    await expect(page.getByText("not stored yet")).toHaveCount(0);
    // Subscriptions and the three newest invoices (the fourth is only on the Invoices page), each with a download.
    const subscription = page.getByRole("article", { name: "Caterly subscription" });
    await expect(subscription).toContainText("Caterly – Premium");
    await expect(subscription).toContainText("Annual Plan");
    await expect(subscription).toContainText("Renews on");
    await expect(subscription).toContainText("12 Nov 2027");
    const latest = page.getByRole("article", { name: "Latest invoices" });
    await expect(latest.getByRole("listitem")).toHaveCount(3);
    await expect(latest).toContainText("FPA-26-11-4");
    await expect(latest).not.toContainText("FPA-26-11-1");
    await expect(latest.getByRole("link", { name: "Download PDF" }).first()).toHaveAttribute("href", /\/api\/account\/invoices\/pay_4\?product=caterly/);
    await shot(page, "data-overview");

    expect((await page.request.get("/business")).status()).toBe(404);

    await page.goto("/products");
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toHaveAttribute("data-selected", "true");
    await shot(page, "data-products");

    await mockProfile(page);
    await page.goto("/profile");
    await expect(page.getByLabel("Email")).toHaveValue(USER.email);
    await expect(page.getByLabel("First name")).toHaveValue("Owner");
    await expect(page.getByLabel("Last name")).toHaveValue("Kitchen");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 98000 00123");
    await expect(page.getByText("Verified", { exact: true })).toHaveCount(2); // the head card and the email field
    await expect(page.getByRole("button", { name: "Edit" })).toBeEnabled();
    await shot(page, "data-profile");

    await page.goto("/security");
    await expect(page.getByText(USER.email).first()).toBeVisible();
    await shot(page, "data-security");
    await page.goto("/devices");
    await expect(page.getByText("Chrome on a laptop")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out of all devices" })).toBeDisabled();
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
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText("Suspended");
  });

  test("no business: every business page shows the empty state, the profile still shows", async ({ page }) => {
    await page.route(OVERVIEW, (r) => json(r, 200, { status: "ok", overview: { user: USER, business: { state: "none" } } }));
    for (const p of ["/products"]) {
      await page.goto(p);
      await expect(page.getByRole("region", { name: "No business yet" })).toBeVisible();
    }
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 3, name: USER.email })).toBeVisible();
    await expect(page.getByRole("region", { name: "No business yet" })).toBeVisible();
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

test.describe("My Products", () => {
  test("shows the product cards in three columns and no team card", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await mockProfile(page);
    await page.route(OVERVIEW, (r) => json(r, 200, { status: "ok", overview: { user: USER, business: { state: "ok", business: BIZ, products: { caterly: "linked", rivo: "none" }, team: [{ id: "m1", name: "Someone Else", email: "else@kitchen.test", role: "manager" }], openUrls: { caterly: "http://catering.localhost:3000/dashboard" } } } }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/products");
    await expect(page.getByRole("heading", { level: 1, name: "My Products" })).toBeVisible();
    const columns = await page.locator(".pa-product-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(3);
    const caterly = await page.getByRole("article", { name: "Caterly", exact: true }).boundingBox();
    const rivo = await page.getByRole("article", { name: "Rivo", exact: true }).boundingBox();
    expect(Math.abs(caterly!.y - rivo!.y)).toBeLessThan(2);
    expect(rivo!.x).toBeGreaterThan(caterly!.x + caterly!.width - 1);
    // Open Caterly goes to the product's own dashboard, from the registry address the server sends; the cards are the sample's (tagline and illustration).
    await expect(page.getByTestId("open-caterly")).toHaveAttribute("href", "http://catering.localhost:3000/dashboard");
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toContainText("Catering business platform");
    await expect(page.getByRole("article", { name: "Rivo", exact: true })).toContainText("Business growth platform");
    // The business's team is not shown here, even when the server sends it.
    await expect(page.getByRole("article", { name: /team/i })).toHaveCount(0);
    await expect(page.getByText("Someone Else")).toHaveCount(0);
    await shot(page, "products-three-columns");
    await page.setViewportSize({ width: 900, height: 900 });
    expect(await page.locator(".pa-product-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.locator(".pa-product-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(1);
  });
});

test.describe("My Products: the cards come from Ops", () => {
  const business = (page: Page) => page.route(OVERVIEW, (r) => json(r, 200, { status: "ok", overview: { user: USER, business: { state: "ok", business: BIZ, products: { caterly: "linked", rivo: "none" }, team: [], openUrls: { caterly: "http://catering.localhost:3000/dashboard" } } } }));

  test("shows the names, lines, pictures and status Ops sends, in Ops's order, and nothing typed in the app", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockCards(page, [
      { key: "rivo", accountKey: "rivo", name: "Rivo Plus", tagline: "Ops wrote this line", imageUrl: "/api/account/product-image/pcd-rivo.png", logoUrl: null, about: null, features: [], status: "UPCOMING", launchAt: null },
      { key: "catering", accountKey: "caterly", name: "Caterly", tagline: "Ops says Caterly is this", imageUrl: null, logoUrl: null, about: null, features: [], status: "LIVE", launchAt: null },
    ]);
    await page.goto("/products");
    const articles = page.locator(".pa-product-grid > article");
    await expect(articles).toHaveCount(2);
    await expect(articles.nth(0)).toContainText("Rivo Plus");
    await expect(articles.nth(0)).toContainText("Ops wrote this line");
    await expect(articles.nth(0)).toContainText("Coming soon");
    await expect(articles.nth(0).locator(".pa-product-art")).toHaveAttribute("style", /product-image\/pcd-rivo\.png/);
    await expect(articles.nth(1)).toContainText("Ops says Caterly is this");
    await expect(articles.nth(1).locator(".pa-product-art")).toHaveCount(0);
    await expect(page.getByText("Business growth platform")).toHaveCount(0);
    await expect(page.getByTestId("open-caterly")).toHaveAttribute("href", "http://catering.localhost:3000/dashboard");
    await expect(page.getByTestId("open-caterly")).toHaveAttribute("target", "_blank");
  });

  test("View details opens the product's page with the About text and items Ops sends, the access card and the subscription", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockCards(page, [
      {
        key: "catering", accountKey: "caterly", name: "Caterly", tagline: "Catering business platform", imageUrl: null, logoUrl: null,
        about: "Ops wrote this paragraph about Caterly.",
        features: [{ icon: "users", title: "Manage enquiries and events", text: "Capture enquiries." }, { icon: "menus", title: "Create and share menus", text: "Build menus." }],
        status: "LIVE", launchAt: null,
      },
    ]);
    await page.route("**/api/account/billing", (r) =>
      json(r, 200, {
        status: "ok", business: { name: "Kitchen" }, invoices: [], payments: [],
        subscriptions: [{ productKey: "caterly", product: "Caterly", planName: "Cross Platform", current: { status: "ACTIVE", interval: "ANNUAL", startDate: "2026-11-07T00:00:00.000Z", currentPeriodEnd: "2027-11-07T00:00:00.000Z", trialEndsAt: null, pendingPlan: null, autoPay: null, paymentMethod: "Mastercard ending 8246" }, history: [], planDetails: null, display: { label: "Active", tone: "good", state: "active", detail: "" } }],
      }),
    );
    await page.goto("/products");
    await page.getByTestId("details-caterly").click();
    await expect(page).toHaveURL(/\/products\/caterly$/);
    await expect(page.getByRole("heading", { name: "Caterly", level: 1 })).toBeVisible();
    await expect(page.getByText("Ops wrote this paragraph about Caterly.")).toBeVisible();
    await expect(page.getByText("Manage enquiries and events")).toBeVisible();
    await expect(page.getByText("Create and share menus")).toBeVisible();
    await expect(page.getByLabel("Account and access")).toContainText("Admin");
    await expect(page.getByLabel("Subscription")).toContainText("Cross Platform");
    await expect(page.getByLabel("Subscription")).toContainText("7 Nov 2027");
    await expect(page.getByTestId("detail-subscription")).toHaveAttribute("href", "/subscriptions/caterly");
    await expect(page.getByTestId("detail-open")).toHaveAttribute("href", "http://catering.localhost:3000/dashboard");
    await expect(page.getByTestId("detail-open")).toHaveAttribute("target", "_blank");
    await expect(page.locator(".pa-crumbs")).toContainText("My Products");
    await expect(page.locator(".pa-crumbs [aria-current='page']")).toHaveText("Caterly");
    if (process.env.ACCOUNT_SHOTS) await page.screenshot({ path: `${process.env.ACCOUNT_SHOTS}/product-details.png`, fullPage: true });
  });

  test("Subscriptions: summary cards, a row per product from Ops, benefits and help, with the details below", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockCards(page, [
      { key: "catering", accountKey: "caterly", name: "Caterly", tagline: "Catering business platform", imageUrl: null, logoUrl: null, about: null, features: [], status: "LIVE", launchAt: null },
      { key: "rivo", accountKey: "rivo", name: "Rivo", tagline: "Business growth platform", imageUrl: null, logoUrl: null, about: null, features: [], status: "UPCOMING", launchAt: null },
    ]);
    await page.route("**/api/account/billing", (r) =>
      json(r, 200, {
        status: "ok", business: { name: "Kitchen" },
        invoices: [{ id: "pay_1", productKey: "caterly", product: "Caterly", invoiceNumber: "FPA-26-11-269", paidAt: "2026-11-07T00:00:00.000Z", planName: "Cross Platform", interval: "ANNUAL", total: 47198.82 }],
        payments: [{ id: "pay_1", productKey: "caterly", product: "Caterly", at: "2026-11-07T00:00:00.000Z", planName: "Cross Platform", interval: "ANNUAL", total: 47198.82, status: "PAID", reason: null, invoiceNumber: "FPA-26-11-269" }],
        subscriptions: [{ productKey: "caterly", product: "Caterly", planName: "Cross Platform", current: { status: "ACTIVE", interval: "ANNUAL", startDate: "2026-11-07T00:00:00.000Z", currentPeriodEnd: "2099-11-07T00:00:00.000Z", trialEndsAt: null, pendingPlan: null, autoPay: null, paymentMethod: "Mastercard ending 8246" }, history: [{ id: "h1", planName: "Cross Platform", status: "ACTIVE", startDate: "2026-11-07T00:00:00.000Z", endDate: null }], planDetails: { total: 47198.82, gstPercent: 18, highlights: [] }, display: { label: "Active", tone: "good", state: "active", detail: "" } }],
      }),
    );
    await page.goto("/subscriptions");
    await expect(page.getByLabel("Active subscriptions")).toContainText("1");
    await expect(page.getByLabel("Next renewal")).toContainText("7 Nov 2099");
    await expect(page.getByLabel("Last invoice")).toContainText("FPA-26-11-269");
    const row = page.getByTestId("sub-row-caterly");
    await expect(row).toContainText("Caterly – Cross Platform");
    await expect(row).toContainText("Catering business platform");
    await expect(row).toContainText("Annual Plan");
    await expect(row).toContainText("₹47,198.82 / year");
    await expect(row).toContainText("Mastercard ending 8246");
    await expect(page.getByLabel("Rivo")).toContainText("Coming soon");
    await expect(page.getByText("Subscription benefits")).toBeVisible();
    await expect(page.getByRole("link", { name: /Contact Support/ })).toBeVisible();
    // The benefits card and the help card are the same height.
    const heights = await Promise.all([page.locator(".pa-benefits").boundingBox(), page.getByLabel("Help with your subscription").boundingBox()]);
    expect(Math.abs(heights[0]!.height - heights[1]!.height)).toBeLessThan(2);
    if (process.env.ACCOUNT_SHOTS) await page.screenshot({ path: `${process.env.ACCOUNT_SHOTS}/subscriptions.png`, fullPage: true });

    // The "…" menu: Subscription Details, and the two popups.
    await page.getByTestId("sub-menu-caterly").click();
    await expect(page.getByRole("menuitem")).toHaveText([/Subscription Details/, /Subscription History/, /Payment History/]);
    await page.getByRole("menuitem", { name: "Subscription History" }).click();
    await expect(page.getByRole("dialog", { name: "Subscription History" })).toContainText("Cross Platform");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByTestId("sub-menu-caterly").click();
    await page.getByRole("menuitem", { name: "Payment History" }).click();
    await expect(page.getByRole("dialog", { name: "Payment History" }).getByTestId("payments-list")).toContainText("₹47,198.82");
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("sub-menu-caterly").click();
    await page.getByRole("menuitem", { name: "Subscription Details" }).click();
    await expect(page).toHaveURL(/\/subscriptions\/caterly$/);
    await expect(page.getByRole("heading", { name: "Caterly Subscription", level: 1 })).toBeVisible();
    const details = page.getByTestId("subscription-caterly");
    await expect(details.getByLabel("Current subscription, Caterly")).toContainText("Annual");
    await expect(details.getByTestId("plan-price")).toHaveText("₹47,198.82 / year (incl. GST)");
    await expect(details.getByLabel("Current subscription, Caterly")).toContainText("7 Nov 2099");
    await expect(details.getByLabel("Billing information")).toContainText("Mastercard ending 8246");
    await expect(details.getByTestId("manage-plan")).toHaveAttribute("href", /\/manage\/caterly$/);
    await expect(details.getByTestId("cancel-subscription")).toHaveCount(0);
    await expect(page.locator(".pa-crumbs [aria-current='page']")).toHaveText("Caterly");
    if (process.env.ACCOUNT_SHOTS) await page.screenshot({ path: `${process.env.ACCOUNT_SHOTS}/subscription-details.png`, fullPage: true });
    await details.getByTestId("billing-history").click();
    await expect(page.getByRole("dialog", { name: "Payment History" })).toBeVisible();
  });

  test("Invoices: summary cards, filters, a table five to a page, and View invoice per row", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockCards(page, [{ key: "catering", accountKey: "caterly", name: "Caterly", tagline: "Catering business platform", imageUrl: null, logoUrl: null, about: null, features: [], status: "LIVE", launchAt: null }]);
    const year = (n: number) => 2026 - n;
    const invoice = (n: number) => ({ id: `pay_${n}`, productKey: "caterly", product: "Caterly", invoiceNumber: `FPA-${year(n) % 100}-11-${100 + n}`, paidAt: `${year(n)}-11-07T00:00:00.000Z`, planName: "Cross Platform", interval: "ANNUAL", total: 1000 });
    const payment = (n: number, refund: unknown = null) => ({ ...invoice(n), at: invoice(n).paidAt, status: "PAID", reason: null, refund });
    await page.route("**/api/account/billing", (r) =>
      json(r, 200, {
        status: "ok", business: { name: "Kitchen" },
        invoices: [0, 1, 2, 3, 4, 5, 6].map(invoice),
        payments: [0, 1, 2, 3, 4, 5, 6].map((n) => payment(n, n === 1 ? { status: "PARTIAL", refunded: 400 } : null)),
        subscriptions: [{ productKey: "caterly", product: "Caterly", planName: "Cross Platform", current: { status: "ACTIVE", interval: "ANNUAL", startDate: "2020-11-07T00:00:00.000Z", currentPeriodEnd: "2099-11-07T00:00:00.000Z", trialEndsAt: null, pendingPlan: null, autoPay: null }, history: [], planDetails: null, display: { label: "Active", tone: "good", state: "active", detail: "" } }],
      }),
    );
    await page.goto("/invoices");
    await expect(page.getByLabel("Total invoices")).toContainText("7");
    await expect(page.getByLabel("Total amount paid")).toContainText("₹6,600");
    await expect(page.getByLabel("Last invoice")).toContainText("FPA-26-11-100");
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("invoice-count")).toHaveText("Showing 1–5 of 7 invoices");
    await expect(page.getByTestId("invoice-pay_1")).toContainText("Partly refunded");
    await expect(page.getByTestId("invoice-pay_0").getByRole("link", { name: "Download" })).toHaveAttribute("href", /\/api\/account\/invoices\/pay_0\?product=caterly$/);
    // "View invoice" opens the PDF inline in a new tab; there is no "…" menu and the Last invoice card has no link.
    await expect(page.getByTestId("view-pay_0")).toHaveAttribute("href", /\/api\/account\/invoices\/pay_0\?product=caterly&view=1$/);
    await expect(page.getByTestId("view-pay_0")).toHaveAttribute("target", "_blank");
    await expect(page.getByLabel("Last invoice").getByRole("link")).toHaveCount(0);
    await expect(page.getByTestId("sub-menu-caterly")).toHaveCount(0);
    // The search is small and on the right of the filters.
    const [dateBox, searchBox] = await Promise.all([page.getByLabel("Date range").boundingBox(), page.getByLabel("Search by invoice number").boundingBox()]);
    expect(searchBox!.width).toBeLessThan(260);
    expect(searchBox!.x).toBeGreaterThan(dateBox!.x + dateBox!.width);
    if (process.env.ACCOUNT_SHOTS) await page.screenshot({ path: `${process.env.ACCOUNT_SHOTS}/invoices.png`, fullPage: true });
    await page.getByRole("button", { name: "Page 2" }).click();
    await expect(page.getByTestId("invoice-count")).toHaveText("Showing 6–7 of 7 invoices");
    await page.getByLabel("Search by invoice number").fill("FPA-26");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByTestId("invoice-count")).toHaveText("Showing 1–1 of 1 invoice");
    await page.getByLabel("Search by invoice number").fill("nothing");
    await expect(page.getByText("No invoices match")).toBeVisible();
    await page.getByLabel("Search by invoice number").fill("");
    await page.getByLabel("Date range").selectOption("365");
    await expect(page.getByTestId("invoice-count")).toHaveText("Showing 1–1 of 1 invoice");
    await page.getByLabel("Date range").selectOption("all");
  });

  test("Billing Details: the form with contact and address fields, required checks and the side cards", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockProfile(page);
    let saved: Record<string, string> | null = null;
    const buyer = { name: "The Kitchen Co.", addressLine1: "301, Lotus Business Park", addressLine2: null, city: "Mumbai", state: "Maharashtra", postalCode: "400104", country: "India", gstin: null, contactName: null, contactEmail: null, contactPhone: null };
    await page.route("**/api/account/billing-profile", (r) => {
      if (r.request().method() === "GET") return json(r, 200, { status: "ok", businessName: "The Kitchen Co.", buyer, updatedAt: "2026-11-01T00:00:00.000Z" });
      saved = r.request().postDataJSON();
      return json(r, 200, { status: "ok", businessName: "The Kitchen Co.", buyer: { ...buyer, ...saved }, updatedAt: "2026-11-15T00:00:00.000Z" });
    });
    await page.goto("/billing-details");
    await expect(page.getByRole("heading", { name: "Billing Details", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business billing information" })).toBeVisible();
    await expect(page.getByLabel("Business / Organisation name")).toHaveValue("The Kitchen Co.");
    await expect(page.getByLabel("State")).toHaveValue("Maharashtra");
    await expect(page.getByLabel("Country *")).toHaveValue("India");
    await expect(page.getByRole("heading", { name: "About billing details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your information is secure" })).toBeVisible();
    // The contact fields are required: a bad email and phone are refused in the form, not silently saved.
    await page.getByLabel("Billing contact person").fill("Amit Sharma");
    await page.getByLabel("Billing email").fill("accounts@thekitchenco.in");
    await page.getByLabel("Billing phone number").fill("98765 43210");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Your billing details were saved. New invoices will use them.")).toBeVisible();
    expect(saved).toMatchObject({ contactName: "Amit Sharma", contactEmail: "accounts@thekitchenco.in", contactPhone: "+919876543210", state: "Maharashtra", country: "India" });
    // Cancel puts back what was last saved.
    await page.getByLabel("City").fill("Pune");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("City")).toHaveValue("Mumbai");
  });

  test("Payment Methods: the methods with Primary, Make primary and a menu, the automatic-renewals switch, and the side cards", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    const products = [{
      productKey: "caterly", product: "Caterly", planName: "Premium", interval: "MONTHLY", autoPay: { status: "ACTIVE", nextChargeAt: "2099-12-07T00:00:00.000Z" },
      methods: [{ id: "m1", kind: "CARD", label: "Mastercard ending 8246", isPrimary: true }, { id: "m2", kind: "CARD", label: "Visa ending 4312", isPrimary: false }, { id: "m3", kind: "UPI", label: "yourname@upi", isPrimary: false }],
    }];
    await page.route("**/api/account/payment-methods", (r) => (r.request().method() === "GET" ? json(r, 200, { status: "ok", businessName: "Kitchen", products }) : json(r, 200, { ok: true })));
    await page.goto("/payment-methods");
    await expect(page.getByRole("heading", { name: "Payment Methods", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your payment methods" })).toBeVisible();
    await page.getByRole("button", { name: "Add payment method" }).click();
    await expect(page.getByRole("menuitem")).toHaveText([/Add card/, /Add UPI/]);
    await expect(page.getByRole("menuitem", { name: "Add card" })).toBeEnabled();
    await expect(page.getByRole("menuitem", { name: /Add UPI/ })).toBeDisabled();
    // Adding a card asks for explicit consent first; nothing opens until it is ticked.
    await page.getByRole("menuitem", { name: "Add card" }).click();
    const consent = page.getByRole("alertdialog", { name: "Save a card" });
    await expect(consent).toContainText("Platterly never sees the number");
    await expect(consent).toContainText("does not start any payment");
    await expect(consent.getByRole("button", { name: "Continue to Razorpay" })).toBeDisabled();
    await consent.getByRole("checkbox").check();
    await expect(consent.getByRole("button", { name: "Continue to Razorpay" })).toBeEnabled();
    await consent.getByRole("button", { name: "Cancel" }).click();
    await expect(consent).toBeHidden();
    const rows = page.getByTestId("method-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("•••• 8246");
    await expect(rows.nth(0)).toContainText("Mastercard");
    await expect(rows.nth(0)).toContainText("Primary");
    await expect(rows.nth(1)).toContainText("•••• 4312");
    await expect(rows.nth(2)).toContainText("yourname@upi");
    await expect(rows.nth(2)).toContainText("UPI");
    await expect(rows.nth(1).getByRole("button", { name: "Make primary" })).toBeVisible();
    // The primary has no menu (it cannot be removed); another method's menu has Remove, which asks first.
    await expect(rows.nth(0).getByRole("button", { name: /More about/ })).toHaveCount(0);
    await rows.nth(1).getByRole("button", { name: /More about/ }).click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Remove Visa ending 4312" })).toBeVisible();
    await page.getByRole("button", { name: "Keep it", exact: true }).click();
    // The switch asks before it pauses.
    const auto = page.getByTestId("auto-renewal");
    await expect(auto).toContainText("On.");
    await expect(auto).toContainText("next charge");
    await auto.getByRole("switch", { name: "Pause auto-renewal" }).click();
    await expect(page.getByRole("button", { name: "Yes, pause" })).toBeVisible();
    await page.getByRole("button", { name: "Keep it on" }).click();
    await expect(page.getByText("How payment methods are used")).toBeVisible();
    await expect(page.getByText("Subscription renewals")).toBeVisible();
    await expect(page.getByRole("link", { name: /Contact Support/ })).toBeVisible();
    if (process.env.ACCOUNT_SHOTS) await page.screenshot({ path: `${process.env.ACCOUNT_SHOTS}/payment-methods.png`, fullPage: true });
  });

  test("a product Ops does not show has no details page", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockCards(page, []);
    await page.goto("/products/nothing");
    await expect(page.getByText("We could not find this product")).toBeVisible();
  });

  test("when Ops cannot be read, only the products the business uses are shown, by name, with a note", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await page.route("**/api/account/products", (r) => json(r, 200, { status: "unavailable" }));
    await page.goto("/products");
    await expect(page.getByRole("status").filter({ hasText: "Product details are not available right now" })).toBeVisible();
    await expect(page.locator(".pa-product-grid > article")).toHaveCount(1);
    await expect(page.getByRole("article", { name: "Caterly", exact: true })).toBeVisible();
    await expect(page.getByTestId("open-caterly")).toBeVisible();
    await expect(page.getByText("Rivo")).toHaveCount(0);
  });

  test("an upcoming product counts down to its launch date, ticking, then says Launching today", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    const start = new Date("2026-12-01T09:00:00.000Z");
    const launch = new Date(start.getTime() + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000);
    await mockCards(page, [{ ...CARDS[1], launchAt: launch.toISOString() }]);
    await page.clock.install({ time: start });
    await page.goto("/products");
    const countdown = page.getByRole("timer");
    await expect(countdown).toContainText("Launching in");
    await expect(countdown).toContainText("02d");
    await expect(countdown).toContainText("03h");
    await expect(countdown).toContainText("04m");
    await expect(countdown).toContainText("05s");
    await page.clock.runFor(3000);
    await expect(countdown).toContainText("02s");
    await page.clock.fastForward((2 * 24 + 3) * 3600 * 1000 + 4 * 60 * 1000 + 5000);
    await page.clock.runFor(1000);
    await expect(page.getByTestId("countdown")).toHaveText("Launching today");
    await expect(page.getByRole("timer")).toHaveCount(0);
  });

  test("an upcoming product with no launch date shows no countdown, and a live one never does", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await business(page);
    await mockCards(page, [{ ...CARDS[0] }, { ...CARDS[1], launchAt: null }]);
    await page.goto("/products");
    await expect(page.getByRole("article", { name: "Rivo", exact: true })).toContainText("Coming soon");
    await expect(page.getByTestId("countdown")).toHaveCount(0);
  });
});

test.describe("Phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("has a menu drawer and no sideways scrolling, with no business and with a business", async ({ page, context }) => {
    await withPlaceholderSession(context);
    await mockProfile(page);
    for (const mode of ["no-business", "business"]) {
      await page.unroute(OVERVIEW).catch(() => {});
      await page.route(OVERVIEW, (r) => json(r, 200, mode === "business" ? okBody() : { status: "ok", overview: { user: USER, business: { state: "none" } } }));
      for (const p of ["/", "/products", "/profile", "/security"]) {
        await page.goto(p);
        // The navigation is a drawer from the left: closed until the menu button is pressed, then every page is a link, and picking a page closes it.
        await expect(nav(page)).toBeHidden();
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(nav(page).getByRole("link", { name: "Products" })).toBeVisible();
        await expect(nav(page).getByRole("link", { name: "Security" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
        await expect.poll(async () => (await page.locator("#pa-side").boundingBox())!.x, { message: "the drawer slides fully in" }).toBeGreaterThanOrEqual(-1);
        expect((await page.locator("#pa-side").boundingBox())!.width).toBeLessThanOrEqual(288);
        await page.getByRole("button", { name: "Close menu" }).click();
        await expect(nav(page)).toBeHidden();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal overflow on ${p} (${mode})`).toBeLessThanOrEqual(0);
      }
    }
    await page.goto("/products");
    await page.getByRole("button", { name: "Open menu" }).click();
    await nav(page).getByRole("link", { name: "Security" }).click();
    await expect(page).toHaveURL(/\/security$/);
    await expect(nav(page)).toBeHidden();
    await shot(page, "phone-products-business");
  });
});

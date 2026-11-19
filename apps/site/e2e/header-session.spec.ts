import { expect, test, type Page } from "@playwright/test";

// The header asks the Platform who is signed in. These specs stand in for the Platform's answer (`/api/account/header`), so they check what the site does with each
// answer. The Platform's own side (what it sends, to whom) is covered by its unit tests and was checked with curl.
const ASK = "**/api/account/header";
// Answers the way the Platform does: only the asking page's own origin, with credentials (a browser refuses "*" when the cookie is sent).
const answer = (page: Page, body: unknown) =>
  page.route(ASK, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": route.request().headers().origin ?? "", "access-control-allow-credentials": "true", vary: "Origin" }, body: JSON.stringify(body) }),
  );
const person = { status: "signed_in", name: "Priya Menon", initials: "PM", photoUrl: null, accountUrl: "https://account.platterly.in/" };
const caterly = { key: "caterly", name: "Caterly by Platterly", openUrl: "https://catering.platterly.in/dashboard" };
const rivo = { key: "rivo", name: "Rivo", openUrl: "https://rivo.platterly.in/dashboard" };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("not signed in: Contact Sales and Get Started", async ({ page }) => {
  await answer(page, { status: "signed_out" });
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Contact Sales" })).toHaveAttribute("href", "/talk-to-us/");
  await expect(header.getByRole("link", { name: "Get Started", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Contact Support" })).toHaveCount(0);
});

test("no answer, or a nonsense answer, is treated as not signed in", async ({ page }) => {
  await page.route(ASK, (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Get Started", exact: true })).toBeVisible();
  const other = await page.context().newPage();
  await answer(other, { status: "signed_in", name: "", initials: "", products: "nope" });
  await other.setViewportSize({ width: 1440, height: 900 });
  await other.goto("/");
  await expect(other.getByRole("banner").getByRole("link", { name: "Get Started", exact: true })).toBeVisible();
});

test("signed in with one product: Contact Support, and the circle opens that product's dashboard", async ({ page }) => {
  await answer(page, { ...person, products: [caterly] });
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Contact Support" })).toHaveAttribute("href", "/contact/");
  await expect(header.getByRole("link", { name: "Get Started", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Contact Sales" })).toHaveCount(0);
  const circle = header.getByRole("link", { name: "Open Caterly by Platterly" });
  await expect(circle).toHaveAttribute("href", caterly.openUrl);
  await expect(circle).toContainText("PM");
  await expect(circle).toHaveCSS("border-radius", /^[1-9]\d*/);
});

test("signed in with several products: the circle opens a menu and each product opens its own dashboard", async ({ page }) => {
  await answer(page, { ...person, products: [caterly, rivo] });
  await page.goto("/");
  const header = page.getByRole("banner");
  const circle = header.getByRole("button", { name: /Priya Menon: your products/ });
  await expect(circle).toHaveAttribute("aria-expanded", "false");
  await circle.click();
  await expect(circle).toHaveAttribute("aria-expanded", "true");
  const menu = header.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /Caterly by Platterly/ })).toHaveAttribute("href", caterly.openUrl);
  await expect(menu.getByRole("menuitem", { name: /Rivo/ })).toHaveAttribute("href", rivo.openUrl);
  await expect(menu.getByRole("menuitem", { name: "Your Account" })).toHaveAttribute("href", person.accountUrl);
  await page.keyboard.press("Escape");
  await expect(circle).toHaveAttribute("aria-expanded", "false");
});

test("signed in with no product yet: the circle opens the Account", async ({ page }) => {
  await answer(page, { ...person, products: [] });
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Open your Account" })).toHaveAttribute("href", person.accountUrl);
});

test("a photo replaces the initials, and falls back to them when it cannot load", async ({ page }) => {
  await page.route("**/missing.png", (route) => route.fulfill({ status: 404 }));
  await answer(page, { ...person, photoUrl: "https://account.platterly.in/missing.png", products: [caterly] });
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Open Caterly by Platterly" })).toContainText("PM");
});

test("on a phone, the menu lists the dashboards, the Account and Contact Support", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await answer(page, { ...person, products: [caterly, rivo] });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.locator("#mobile-menu");
  await expect(menu.getByRole("link", { name: "Open Caterly by Platterly" })).toHaveAttribute("href", caterly.openUrl);
  await expect(menu.getByRole("link", { name: "Open Rivo" })).toHaveAttribute("href", rivo.openUrl);
  await expect(menu.getByRole("link", { name: "Your Account" }).first()).toBeVisible();
  await expect(menu.getByRole("link", { name: "Contact Support" })).toHaveAttribute("href", "/contact/");
  await expect(menu.getByRole("link", { name: "Get Started" })).toHaveCount(0);
});

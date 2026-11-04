import { expect, test, type Page } from "@playwright/test";

/** Account prototype (sample data, no sign-in). Every test starts in a fresh browser context, so the state starts from the initial mock data. */
const BIZ = { spice: "Spice Route Caterers", saffron: "Saffron & Co. Events", basil: "Little Basil Cloud Kitchen" };

const switcher = (page: Page) => page.getByRole("button", { name: /Switch business/ });
const nav = (page: Page) => page.getByRole("navigation", { name: "Account" });

async function pickInSwitcher(page: Page, business: string) {
  await switcher(page).click();
  await page.getByRole("listbox", { name: "Your businesses" }).getByRole("button", { name: new RegExp(business) }).click();
}

test.describe("Account overview", () => {
  test("shows the welcome, the current business, My Businesses, My Products, the profile summary and the navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Meera" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Current business" })).toContainText(BIZ.spice);
    await expect(page.getByRole("heading", { name: "My Businesses" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Products" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
    await expect(page.getByText("meera.kapoor@example.com").first()).toBeVisible();
    for (const label of ["Overview", "Businesses", "Products", "Profile"]) await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/Prototype with sample data/)).toBeVisible();
  });

  test("switching business from the overview list changes the current business, the sidebar and the Caterly status", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: `Switch to ${BIZ.basil}` }).click();
    await expect(page.getByRole("region", { name: "Current business" })).toContainText(BIZ.basil);
    await expect(switcher(page)).toContainText(BIZ.basil);
    await expect(page.getByRole("button", { name: `${BIZ.basil}, selected` })).toBeVisible();
    await expect(page.getByRole("article", { name: "Caterly" })).toContainText("Not set up");
  });
});

test.describe("My Businesses", () => {
  test("lists the businesses with name, type, status and which one is selected, and switching moves the selection", async ({ page }) => {
    await page.goto("/businesses");
    const cards = page.getByRole("list", { name: "Businesses" }).getByRole("article");
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("article", { name: BIZ.spice })).toContainText("Wedding and event catering");
    await expect(page.getByRole("article", { name: BIZ.spice })).toContainText("Active");
    await expect(page.getByRole("article", { name: BIZ.saffron })).toContainText("On trial");
    await expect(page.getByRole("article", { name: BIZ.basil })).toContainText("Setup pending");
    await expect(page.getByRole("article", { name: BIZ.spice })).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("article", { name: BIZ.spice })).toContainText("Selected");

    await page.getByRole("button", { name: `Switch to ${BIZ.saffron}` }).click();
    await expect(page.getByRole("article", { name: BIZ.saffron })).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("article", { name: BIZ.spice })).toHaveAttribute("data-selected", "false");
    await expect(switcher(page)).toContainText(BIZ.saffron);
  });

  test("the sidebar switcher opens as a list, marks the current business, switches, and closes on Escape", async ({ page }) => {
    await page.goto("/businesses");
    await switcher(page).click();
    const list = page.getByRole("listbox", { name: "Your businesses" });
    await expect(list.getByRole("option")).toHaveCount(3);
    await expect(list.getByRole("option", { name: new RegExp(BIZ.spice) })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await pickInSwitcher(page, BIZ.basil);
    await expect(page.getByRole("article", { name: BIZ.basil })).toHaveAttribute("data-selected", "true");
  });

  test("the selected business survives moving between pages and a reload of the tab", async ({ page }) => {
    await page.goto("/businesses");
    await pickInSwitcher(page, BIZ.saffron);
    await nav(page).getByRole("link", { name: "Products" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(switcher(page)).toContainText(BIZ.saffron);
    await page.reload();
    await expect(switcher(page)).toContainText(BIZ.saffron);
    await expect(page.getByRole("article", { name: "Caterly" })).toContainText("Free trial, 12 days left");
  });
});

test.describe("My Products", () => {
  test("shows Caterly as available for the selected business and Rivo as a clearly labelled upcoming product", async ({ page }) => {
    await page.goto("/products");
    const caterly = page.getByRole("article", { name: "Caterly" });
    await expect(caterly).toContainText("Available");
    await expect(caterly).toContainText(`For ${BIZ.spice}`);
    await expect(caterly).toContainText("Caterly Pro, renews 14 Jan 2027");
    const rivo = page.getByRole("article", { name: "Rivo" });
    await expect(rivo).toContainText("Coming soon");
    await expect(rivo).toContainText("Not available to any business yet");
    await expect(rivo.getByRole("button", { name: "Open Rivo" })).toHaveCount(0);
  });

  test("Open Caterly walks through the launch steps, ends on a clear prototype note and closes", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Open Caterly" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Opening Caterly");
    await expect(dialog).toContainText(`for ${BIZ.spice}`);
    await expect(dialog.getByRole("heading", { name: "Caterly is ready" })).toBeVisible();
    await expect(dialog).toContainText("sign-in is not connected yet");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/products$/);
  });

  test("a launch can be cancelled with Escape before it finishes", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Open Caterly" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("a business without Caterly offers Set up Caterly, which puts it on a trial for that business only", async ({ page }) => {
    await page.goto("/products");
    await pickInSwitcher(page, BIZ.basil);
    const caterly = page.getByRole("article", { name: "Caterly" });
    await expect(caterly).toContainText("Not set up");
    await expect(caterly.getByRole("button", { name: "Open Caterly" })).toHaveCount(0);
    await caterly.getByRole("button", { name: "Set up Caterly" }).click();
    await expect(caterly).toContainText("On trial");
    await expect(caterly.getByRole("button", { name: "Open Caterly" })).toBeVisible();
    await pickInSwitcher(page, BIZ.spice);
    await expect(caterly).toContainText("Caterly Pro, renews 14 Jan 2027");
  });

  test("Notify me for Rivo is a toggle that keeps its state across pages", async ({ page }) => {
    await page.goto("/products");
    const rivo = page.getByRole("article", { name: "Rivo" });
    await rivo.getByRole("button", { name: "Notify me" }).click();
    await expect(rivo.getByRole("button", { name: "We will let you know" })).toHaveAttribute("aria-pressed", "true");
    await nav(page).getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("article", { name: "Rivo" }).getByRole("button", { name: "We will let you know" })).toBeVisible();
    await page.getByRole("article", { name: "Rivo" }).getByRole("button", { name: "We will let you know" }).click();
    await expect(page.getByRole("article", { name: "Rivo" }).getByRole("button", { name: "Notify me" })).toBeVisible();
  });
});

test.describe("Profile", () => {
  test("shows the details read-only, edits them locally, cancels without keeping changes, and saves", async ({ page }) => {
    await page.goto("/profile");
    const name = page.getByLabel("Full name");
    await expect(name).toHaveValue("Meera Kapoor");
    await expect(name).toBeDisabled();
    await expect(page.getByLabel("Email")).toBeDisabled();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(name).toBeEnabled();
    await expect(page.getByLabel("Email")).toBeDisabled();
    await name.fill("Someone Else");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(name).toHaveValue("Meera Kapoor");

    await page.getByRole("button", { name: "Edit" }).click();
    await name.fill("Meera K. Kapoor");
    await page.getByLabel("Phone").fill("+91 98765 43210");
    await page.getByLabel("Time zone").selectOption({ label: "Asia/Dubai (GST, UTC+4)" });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved in this browser tab only");
    await expect(name).toHaveValue("Meera K. Kapoor");
    await expect(name).toBeDisabled();
    await expect(page.getByRole("heading", { level: 2, name: "Meera K. Kapoor" })).toBeVisible();

    await nav(page).getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("heading", { name: "Meera K. Kapoor" })).toBeVisible();
    await expect(page.getByText("+91 98765 43210")).toBeVisible();
  });

  test("an empty name is not saved, preferences toggle, security actions say they are not connected", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Full name").fill("   ");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Kapoor");

    const updates = page.getByRole("switch", { name: "Product updates" });
    await expect(updates).toBeChecked();
    await updates.uncheck();
    await expect(updates).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Security alerts" })).toBeDisabled();

    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status").last()).toContainText("not connected in this prototype");
  });
});

test.describe("Host routing is unchanged", () => {
  test("the auth and store hosts still answer with their placeholder and not the Account", async ({ page }) => {
    for (const kind of ["auth", "store"]) {
      await page.goto(`http://${kind}.localhost:3300/`);
      await expect(page.getByText(`Platterly ${kind}`, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Welcome back/ })).toHaveCount(0);
    }
  });

  test("the Account pages answer 404 on the auth and store hosts and on a bare or unknown host", async ({ request }) => {
    for (const host of ["auth.localhost:3300", "store.localhost:3300"]) {
      for (const path of ["/businesses", "/products", "/profile"]) {
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

test.describe("Phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("has a bottom navigation, no sideways scrolling on any page, and a working business switcher", async ({ page }) => {
    for (const path of ["/", "/businesses", "/products", "/profile"]) {
      await page.goto(path);
      await expect(nav(page).getByRole("link", { name: "Products" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
      const box = await nav(page).boundingBox();
      expect(box!.y + box!.height).toBeGreaterThan(844 - 2);
    }
    await page.goto("/businesses");
    await pickInSwitcher(page, BIZ.basil);
    await expect(page.getByRole("article", { name: BIZ.basil })).toHaveAttribute("data-selected", "true");
    // The Next.js dev-mode indicator (bottom-right, next.config.ts) sits over the last tab and eats taps in `next dev` only,
    // so the last tab is activated by keyboard here. It does not exist in a production build.
    await nav(page).getByRole("link", { name: "Profile" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/profile$/);
  });
});

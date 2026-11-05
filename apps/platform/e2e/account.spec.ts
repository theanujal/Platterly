import { expect, test, type Page } from "@playwright/test";

/** Account prototype (sample data, no sign-in). One business per account; the sidebar switches PRODUCT, not business. Every test starts in a fresh browser context, so the state starts from the initial mock data. */
const BIZ = "Spice Route Caterers";

const switcher = (page: Page) => page.getByRole("button", { name: /Switch product/ });
const nav = (page: Page) => page.getByRole("navigation", { name: "Account" });

async function pickInSwitcher(page: Page, product: string) {
  await switcher(page).click();
  await page.getByRole("listbox", { name: "Your products" }).getByRole("button", { name: new RegExp(product) }).click();
}

test.describe("Account overview", () => {
  test("the home page shows the welcome, the profile summary and My Products, with no business section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Meera" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Your profile" })).toBeVisible();
    await expect(page.getByText("meera.kapoor@example.com").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "My Products" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Caterly" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Rivo" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Your business" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "My Business" })).toHaveCount(0);
    for (const label of ["Overview", "Products", "Profile", "Security"]) await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Business" })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/Prototype with sample data/)).toBeVisible();
  });

  test("there is no business list and no business switcher anywhere", async ({ page }) => {
    for (const path of ["/", "/business", "/products", "/profile", "/security"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /Switch business/ })).toHaveCount(0);
      await expect(page.getByRole("listbox", { name: "Your businesses" })).toHaveCount(0);
      await expect(page.getByText(/Saffron|Little Basil/)).toHaveCount(0);
    }
  });
});

test.describe("Product switcher", () => {
  test("shows the business and the current product, lists the products, switches and closes on Escape", async ({ page }) => {
    await page.goto("/");
    await expect(switcher(page)).toContainText(BIZ);
    await expect(switcher(page)).toContainText("Caterly");
    await switcher(page).click();
    const list = page.getByRole("listbox", { name: "Your products" });
    await expect(list.getByRole("option")).toHaveCount(2);
    await expect(list.getByRole("option", { name: /Caterly/ })).toHaveAttribute("aria-selected", "true");
    await expect(list.getByRole("option", { name: /Rivo/ })).toContainText("Coming soon");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await pickInSwitcher(page, "Rivo");
    await expect(switcher(page)).toContainText("Rivo");
    await expect(page.getByRole("article", { name: "Rivo" })).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("article", { name: "Caterly" })).toHaveAttribute("data-selected", "false");
  });

  test("the chosen product survives moving between pages and a reload of the tab", async ({ page }) => {
    await page.goto("/products");
    await pickInSwitcher(page, "Rivo");
    await nav(page).getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(switcher(page)).toContainText("Rivo");
    await page.reload();
    await expect(switcher(page)).toContainText("Rivo");
  });
});

test.describe("My Business", () => {
  test("shows the one business with its type, status and role, and says the data is placeholder data", async ({ page }) => {
    await page.goto("/business");
    await expect(page.getByRole("heading", { level: 1, name: "My Business" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("invented sample data");
    const card = page.getByRole("article", { name: BIZ });
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(card).toContainText("Wedding and event catering");
    await expect(card).toContainText("Setup pending");
    await expect(card).toContainText("Admin");
    await expect(page.getByText(/A second kitchen needs another email/)).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Business" })).toHaveCount(0);
  });

  test("the old plural address no longer exists", async ({ request }) => {
    expect((await request.get("http://account.localhost:3300/businesses")).status()).toBe(404);
  });
});

test.describe("My Products", () => {
  test("shows Caterly as available for the business and Rivo as a clearly labelled upcoming product", async ({ page }) => {
    await page.goto("/products");
    const caterly = page.getByRole("article", { name: "Caterly" });
    await expect(caterly).toContainText("Available");
    await expect(caterly).toContainText(`For ${BIZ}`);
    await expect(caterly).toContainText("Not set up for this business");
    const rivo = page.getByRole("article", { name: "Rivo" });
    await expect(rivo).toContainText("Coming soon");
    await expect(rivo).toContainText("Not available to any business yet");
    await expect(rivo.getByRole("button", { name: "Open Rivo" })).toHaveCount(0);
  });

  test("Set up Caterly puts the business on a trial; Open Caterly then walks through the launch steps and ends on a clear prototype note", async ({ page }) => {
    await page.goto("/products");
    const caterly = page.getByRole("article", { name: "Caterly" });
    await expect(caterly.getByRole("button", { name: "Open Caterly" })).toHaveCount(0);
    await caterly.getByRole("button", { name: "Set up Caterly" }).click();
    await expect(caterly).toContainText("On trial");
    await caterly.getByRole("button", { name: "Open Caterly" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Opening Caterly");
    await expect(dialog).toContainText(`for ${BIZ}`);
    await expect(dialog.getByRole("heading", { name: "Caterly is ready" })).toBeVisible();
    await expect(dialog).toContainText("sign-in is not connected yet");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/products$/);
  });

  test("a launch can be cancelled with Escape before it finishes", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Set up Caterly" }).click();
    await page.getByRole("button", { name: "Open Caterly" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the Caterly status shows in the switcher and on the overview after set up", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Set up Caterly" }).click();
    await switcher(page).click();
    await expect(page.getByRole("listbox", { name: "Your products" }).getByRole("option", { name: /Caterly/ })).toContainText("On trial");
    await page.keyboard.press("Escape");
    await nav(page).getByRole("link", { name: "Overview" }).click();
    await expect(page.getByRole("article", { name: "Caterly" })).toContainText("On trial");
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

  test("an empty name is not saved, preferences toggle, and security settings live on their own page", async ({ page }) => {
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

    await page.getByRole("link", { name: "Open Security" }).click();
    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
  });
});

test.describe("Account header", () => {
  test("names the current page, says the data is sample data, and shows the account holder on every page", async ({ page }) => {
    const pages: [string, string][] = [["/", "Overview"], ["/products", "My Products"], ["/profile", "My Profile"], ["/security", "Security"]];
    for (const [path, title] of pages) {
      await page.goto(path);
      const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(crumbs).toContainText("Account");
      await expect(crumbs.locator("[aria-current=page]")).toHaveText(title);
      await expect(page.locator(".pa-topbar").getByText("Sample data")).toBeVisible();
      await expect(page.locator(".pa-topbar").getByRole("link", { name: "Your profile" })).toBeVisible();
    }
  });
});

test.describe("Security", () => {
  test("loads with a placeholder note, the sign-in rows and sample devices, and is marked current in the navigation", async ({ page }) => {
    await page.goto("/security");
    await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("note")).toContainText("Sign-in is not built yet");
    await expect(page.getByText("meera.kapoor@example.com").first()).toBeVisible();
    for (const row of ["Password", "Two-step verification", "Recovery email"]) await expect(page.getByText(row, { exact: true })).toBeVisible();
    const devices = page.getByRole("list", { name: "Signed-in devices (sample)" }).getByRole("listitem");
    await expect(devices).toHaveCount(3);
    await expect(devices.first()).toContainText("This device");
  });

  test("every action says it is not connected and changes nothing", async ({ page }) => {
    await page.goto("/security");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status")).toContainText("Password is not connected yet. Nothing was changed.");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page.getByRole("status")).toContainText("Signing out of all devices is not connected yet");
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await expect(page.getByRole("status")).toContainText("is not connected yet");
    await expect(page.getByRole("list", { name: "Signed-in devices (sample)" }).getByRole("listitem")).toHaveCount(3);
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
      for (const path of ["/business", "/products", "/profile", "/security"]) {
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

  test("has a bottom navigation, no sideways scrolling on any page, and a working product switcher", async ({ page }) => {
    for (const path of ["/", "/products", "/profile", "/security"]) {
      await page.goto(path);
      await expect(nav(page).getByRole("link", { name: "Products" })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Security" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
      const box = await nav(page).boundingBox();
      expect(box!.y + box!.height).toBeGreaterThan(844 - 2);
    }
    await page.goto("/products");
    await pickInSwitcher(page, "Rivo");
    await expect(page.getByRole("article", { name: "Rivo" })).toHaveAttribute("data-selected", "true");
    // The Next.js dev-mode indicator (bottom-right, next.config.ts) sits over the last tab and eats taps in `next dev` only,
    // so the last tab is activated by keyboard here. It does not exist in a production build.
    await nav(page).getByRole("link", { name: "Profile" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/profile$/);
  });
});

import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";

/**
 * The public Build Your Menu step (menus, dishes, add-ons in one page) must never scroll sideways, on a desktop, a
 * tablet or a phone, and a pick past a category limit must read "n/n selected + k extra". Builds its own small catalog.
 */
import { pickCalendarDate, signUpCaterer } from "./auth-helpers";

const emails: string[] = [];
test.afterEach(async () => { const e = emails.pop(); if (e) await cleanupOnboardingTestUser(e); });

test("Build Your Menu fits desktop, tablet and phone: no sideways scroll at any step, and an extra reads \"2/2 + 1 extra\"", async ({ page, browser }) => {
  test.setTimeout(400_000);
  const suffix = Date.now().toString().slice(-6);
  const email = `e2e-shots-${Date.now()}@example.test`;
  emails.push(email);
  const slug = `shots-${suffix}`;
  await signUpCaterer(page, email, { closeClaimDialog: false });
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const menuA = `North Indian Menu ${suffix}`; const menuB = `Veg Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  for (const [n, p] of [[menuA, "400"], [menuB, "350"]]) {
    await page.getByRole("button", { name: "Add Menu Type" }).click();
    await page.getByLabel("Menu Name").fill(n);
    await page.getByLabel("Price Per Plate").fill(p);
    await page.getByRole("button", { name: "Create menu" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  const cats = [`Main Course ${suffix}`, `Starters ${suffix}`, `Rice ${suffix}`];
  await page.goto("/menu-catalog/categories");
  for (const [i, c] of cats.entries()) {
    await page.getByRole("button", { name: "Add Category" }).click();
    await page.getByLabel("Category Name").fill(c);
    await page.getByRole("checkbox", { name: menuA }).check();
    await page.getByPlaceholder("Max selection").fill(i === 1 ? "2" : "1");
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page.goto("/menu-catalog/items");
  const dishes: [string, string, number][] = [["Dal Makhani","150",0],["Paneer Butter Masala","160",0],["Kadhai Paneer","170",0],["Paneer 65","140",1],["Veg Kebab","130",1],["Spring Roll","120",1],["Jeera Rice","90",2],["Pulao","95",2]];
  for (const [name, price, c] of dishes) {
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Item Name").fill(name);
    await page.getByLabel("Item Price Per Plate").fill(price);
    await page.getByRole("checkbox", { name: menuA }).check();
    await page.getByRole("checkbox", { name: cats[c] }).check();
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page.goto("/menu-catalog/add-ons");
  for (const n of ["Chaat Counter", "Mocktails"]) {
    await page.getByRole("button", { name: "Add Add-on" }).click();
    await page.getByLabel("Name").fill(n);
    await page.getByLabel("Price", { exact: true }).fill("70");
    await page.getByRole("button", { name: "Create add-on" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  const et = `Wedding ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(et);
  await page.getByRole("checkbox", { name: menuA }).check();
  await page.getByRole("checkbox", { name: menuB }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const sizes = [{ n: "desktop", w: 1280, h: 900 }, { n: "tablet", w: 820, h: 1180 }, { n: "phone", w: 390, h: 844 }];
  for (const sz of sizes) {
    const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}` } });
    const p = await ctx.newPage();
    const shot = async (name: string, full = false) => { await p.waitForTimeout(300); const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); expect(over, `${sz.n} ${name} scrolls sideways`).toBeLessThanOrEqual(0); void full; };
    await p.goto(`/${slug}`);
    await p.getByLabel("Your Name").fill("Asha Rao");
    await p.getByLabel("Email Address").fill(`a${suffix}${sz.n}@example.test`);
    await p.getByRole("textbox", { name: "Phone Number" }).fill("98765" + Math.floor(10000 + Math.random()*89999));
    await pickCalendarDate(p, p.getByLabel("Event Date"), new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0,10));
    await p.getByLabel("Event Type").click();
    await p.getByRole("option", { name: et }).click();
    await p.getByLabel("Number of Adults").fill("40");
    await p.getByRole("checkbox", { name: "Dinner" }).click();
    await p.getByRole("radio", { name: /^Vegetarian/ }).click();
    await p.getByLabel("Venue Location").fill("Whitefield, Bangalore");
    await shot("1-details", true);
    await p.getByRole("button", { name: "Continue to Build Your Menu" }).click();
    await expect(p.getByRole("heading", { name: "Build Your Menu" })).toBeVisible();
    await shot("2-menus", true);
    await p.getByTestId("menu-card").filter({ hasText: menuA }).getByRole("button", { name: "Select", exact: true }).click();
    await shot("3-dishes", true);
    // pick required dishes
    if (sz.n !== "desktop") {
      for (const c of cats) {
        const sec = p.getByTestId("item-section").filter({ hasText: c });
        if (await sec.getByRole("button", { expanded: false }).count()) await sec.getByRole("button", { expanded: false }).first().click();
      }
    }
    for (const [name, , c] of dishes) {
      if (await p.getByTestId("dishes-section").isHidden()) break; // complete: the dishes have folded into the accordion
      const card = p.getByTestId("item-card").filter({ hasText: name });
      if (sz.n === "desktop") { await p.getByRole("tab", { name: new RegExp(cats[c]) }).click(); }
      const done = (await p.getByTestId("category-counter").filter({ hasText: cats[c] }).count()) >= 0;
      void done;
      if (await card.getByRole("button", { name: "Select", exact: true }).count()) {
        const counterText = await p.getByTestId("item-section").filter({ hasText: cats[c] }).getByTestId("category-counter").innerText();
        const m = counterText.match(/(\d+)\/(\d+)/)!;
        if (Number(m[1]) < Number(m[2])) await card.getByRole("button", { name: "Select", exact: true }).click();
      }
    }
    // The dishes fold into an accordion once complete and the add-ons are showcased; the bar stays on screen at every size.
    await expect(p.getByTestId("dishes-accordion-summary")).toBeVisible();
    await expect(p.getByTestId("dishes-section")).toBeHidden();
    await expect(p.getByText("Add-ons & Live Counters").first()).toBeVisible();
    await expect(p.getByRole("button", { name: "Back" })).toBeInViewport();
    await expect(p.getByRole("button", { name: "Continue to Review" })).toBeInViewport();
    await shot("4-addons", true);
    // Reopen the dishes to add an extra.
    await p.getByRole("button", { name: /Select Dishes/ }).click();
    await expect(p.getByTestId("dishes-section")).toBeVisible();
    // an extra: pick a 3rd starter
    if (sz.n === "desktop") await p.getByRole("tab", { name: new RegExp(cats[1]) }).click();
    await p.getByTestId("item-card").filter({ hasText: "Spring Roll" }).getByRole("button", { name: "Select", exact: true }).click();
    await p.getByRole("button", { name: /^Add Spring Roll/ }).click();
    await p.getByRole("button", { name: "Select Chaat Counter" }).click();
    await expect(p.getByTestId("category-counter").filter({ hasText: "+ 1 extra" })).toHaveCount(1);
    await shot("5-extra-and-addon", true);
    await p.getByRole("button", { name: "Continue to Review" }).or(p.getByRole("button", { name: "Continue", exact: true })).first().click();
    await expect(p).toHaveURL(/step=review/);
    await shot("6-review", true);
    await ctx.close();
  }
});

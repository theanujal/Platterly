import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { pickCalendarDate, signUpCaterer } from "./auth-helpers";

/**
 * Build Your Menu > Your Selection > Event Summary > Edit (AJ, 2026-10-14): the details open in a side panel on the same
 * page, so a customer who spots a wrong guest count keeps the menu and dishes they just picked, even before Continue.
 */
const emails: string[] = [];
test.afterEach(async () => { const e = emails.pop(); if (e) await cleanupOnboardingTestUser(e); });

test("Edit event details in a side panel: unsaved dish picks stay, the summary updates", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const suffix = Date.now().toString().slice(-6);
  const email = `e2e-editdet-${Date.now()}@example.test`;
  emails.push(email);
  const slug = `editdet-${suffix}`;
  await signUpCaterer(page, email, { closeClaimDialog: false });
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const menu = `Thali ${suffix}`;
  const cat = `Mains ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menu);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/menu-catalog/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(cat);
  await page.getByRole("checkbox", { name: menu }).check();
  await page.getByPlaceholder("Max selection").fill("2");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/menu-catalog/items");
  for (const name of ["Dal Fry", "Jeera Rice"]) {
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Item Name").fill(name);
    await page.getByLabel("Item Price Per Plate").fill("100");
    await page.getByRole("checkbox", { name: menu }).check();
    await page.getByRole("checkbox", { name: cat }).check();
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  const eventType = `Party ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventType);
  await page.getByRole("checkbox", { name: menu }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const p = await ctx.newPage();
  await p.goto(`/${slug}`);
  await p.getByLabel("Your Name").fill("Asha Rao");
  await p.getByLabel("Email Address").fill(`a${suffix}@example.test`);
  await p.getByRole("textbox", { name: "Phone Number" }).fill("98765" + Math.floor(10000 + Math.random() * 89999));
  await pickCalendarDate(p, p.getByLabel("Event Date"), new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));
  await p.getByLabel("Event Type").click();
  await p.getByRole("option", { name: eventType }).click();
  await p.getByLabel("Number of Adults").fill("40");
  await p.getByRole("checkbox", { name: "Dinner" }).click();
  await p.getByRole("radio", { name: /^Vegetarian/ }).click();
  await p.getByLabel("Venue Location").fill("Whitefield, Bangalore");
  await p.getByRole("button", { name: "Continue to Build Your Menu" }).click();
  await expect(p.getByRole("heading", { name: "Build Your Menu" })).toBeVisible();
  const url = p.url();

  // Pick a menu and one dish, none of it saved yet.
  await p.getByTestId("menu-card").filter({ hasText: menu }).getByRole("button", { name: "Select", exact: true }).click();
  await p.getByTestId("item-card").filter({ hasText: "Dal Fry" }).getByRole("button", { name: "Select", exact: true }).click();
  await expect(p.getByTestId("selection-summary")).toHaveText(/1 dish selected/);

  // Edit opens a panel, not another page.
  await p.getByRole("button", { name: "Edit", exact: true }).click();
  const panel = p.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Edit Event Details" })).toBeVisible();
  await expect(p).toHaveURL(url);
  await panel.getByLabel("Number of Adults").fill("55");
  await panel.getByRole("button", { name: "Save Changes" }).click();
  await expect(panel).not.toBeVisible();

  // Same page, summary updated, picks still there.
  await expect(p).toHaveURL(url);
  await expect(p.getByTestId("summary-total-guests")).toHaveText("55");
  await expect(p.getByTestId("selection-summary")).toHaveText(/1 dish selected/);
  await expect(p.getByText(menu).first()).toBeVisible();
});

test("kids are shown on top of the adults: live total on the form, breakdown in the summary", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const suffix = Date.now().toString().slice(-6);
  const email = `e2e-guests-${Date.now()}@example.test`;
  emails.push(email);
  const slug = `guests-${suffix}`;
  await signUpCaterer(page, email, { closeClaimDialog: false });
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const menu = `Thali ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menu);
  await page.getByLabel("Price Per Plate").fill("300");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const eventType = `Party ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventType);
  await page.getByRole("checkbox", { name: menu }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const p = await ctx.newPage();
  await p.goto(`/${slug}`);
  await p.getByLabel("Your Name").fill("Asha Rao");
  await p.getByLabel("Email Address").fill(`g${suffix}@example.test`);
  await p.getByRole("textbox", { name: "Phone Number" }).fill("98765" + Math.floor(10000 + Math.random() * 89999));
  await pickCalendarDate(p, p.getByLabel("Event Date"), new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));
  await p.getByLabel("Event Type").click();
  await p.getByRole("option", { name: eventType }).click();
  await p.getByLabel("Number of Adults (11+ years)").fill("50");
  await expect(p.getByTestId("guest-total")).toHaveCount(0);
  await p.getByLabel("Number of Kids (0–5 Years)").fill("10");
  await p.getByLabel("Number of Kids (5–10 Years)").fill("20");
  await expect(p.getByTestId("guest-total")).toHaveText("Total guests: 80 (50 adults + 10 kids (0–5) + 20 kids (5–10))");
  await p.getByRole("checkbox", { name: "Dinner" }).click();
  await p.getByRole("radio", { name: /^Vegetarian/ }).click();
  await p.getByLabel("Venue Location").fill("Whitefield, Bangalore");
  await p.getByRole("button", { name: "Continue to Build Your Menu" }).click();
  await expect(p.getByRole("heading", { name: "Build Your Menu" })).toBeVisible();
  const panel = p.getByRole("complementary", { name: "Your selection" });
  await expect(panel.getByText("Adult Guests")).toBeVisible();
  await expect(panel.getByText("Kids (0–5)")).toBeVisible();
  await expect(panel.getByText("Kids (5–10)")).toBeVisible();
  await expect(panel.getByTestId("summary-total-guests")).toHaveText("80");
});

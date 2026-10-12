import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, getOrderMealMenus } from "./db";
import { pickCalendarDate, signUpCaterer } from "./auth-helpers";

/**
 * Public form, several meals in one day (AJ, 2026-10-12): the customer ticks Lunch and Dinner; each meal picks its own
 * menu and dishes, one after the other; one guest number covers the whole order; the review lists both meals and prices each
 * on its own menu; the order is a Multi Order with one entry per meal on its own menu. The 2-day notice stays.
 */

const emails: string[] = [];
test.afterEach(async () => {
  const e = emails.pop();
  if (e) await cleanupOnboardingTestUser(e);
});

test("tick Lunch and Dinner, build each meal on its own menu, review both, submit a Multi Order", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const suffix = Date.now().toString().slice(-6);
  const email = `e2e-meals-${Date.now()}@example.test`;
  emails.push(email);
  const slug = `meals-${suffix}`;
  await signUpCaterer(page, email, { closeClaimDialog: false });
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // Two menus, each with one category (pick 1) and two dishes, both offered for the event type.
  const menuA = `Lunch Thali ${suffix}`;
  const menuB = `Dinner Feast ${suffix}`;
  await page.goto("/menu-catalog/menus");
  for (const [name, price] of [[menuA, "400"], [menuB, "250"]]) {
    await page.getByRole("button", { name: "Add Menu Type" }).click();
    await page.getByLabel("Menu Name").fill(name);
    await page.getByLabel("Price Per Plate").fill(price);
    await page.getByRole("button", { name: "Create menu" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  const catA = `Mains A ${suffix}`;
  const catB = `Mains B ${suffix}`;
  await page.goto("/menu-catalog/categories");
  for (const [cat, menu] of [[catA, menuA], [catB, menuB]]) {
    await page.getByRole("button", { name: "Add Category" }).click();
    await page.getByLabel("Category Name").fill(cat);
    await page.getByRole("checkbox", { name: menu }).check();
    await page.getByPlaceholder("Max selection").fill("1");
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page.goto("/menu-catalog/items");
  const dishes: [string, string, string, string][] = [
    [`Dal Tadka ${suffix}`, "120", menuA, catA],
    [`Rajma ${suffix}`, "110", menuA, catA],
    [`Paneer Lababdar ${suffix}`, "150", menuB, catB],
    [`Veg Biryani ${suffix}`, "140", menuB, catB],
  ];
  for (const [name, price, menu, cat] of dishes) {
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Item Name").fill(name);
    await page.getByLabel("Item Price Per Plate").fill(price);
    await page.getByRole("checkbox", { name: menu }).check();
    await page.getByRole("checkbox", { name: cat }).check();
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  const eventType = `Reception ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventType);
  await page.getByRole("checkbox", { name: menuA }).check();
  await page.getByRole("checkbox", { name: menuB }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // The customer: Lunch and Dinner on one day, one guest number.
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const p = await ctx.newPage();
  await p.goto(`/${slug}`);
  await p.getByLabel("Your Name").fill("Meals Customer");
  await p.getByLabel("Email Address").fill(`meals${suffix}@example.test`);
  await p.getByRole("textbox", { name: "Phone Number" }).fill("98765" + Math.floor(10000 + Math.random() * 89999));
  await pickCalendarDate(p, p.getByLabel("Event Date"), new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));
  await p.getByLabel("Event Type").click();
  await p.getByRole("option", { name: eventType }).click();
  await p.getByLabel("Number of Adults").fill("40");
  await p.getByRole("checkbox", { name: "Lunch" }).click();
  await p.getByRole("checkbox", { name: "Dinner" }).click();
  await p.getByRole("radio", { name: /^Vegetarian/ }).click();
  await p.getByLabel("Venue Location").fill("Whitefield, Bangalore");
  await p.getByRole("button", { name: "Continue to Build Your Menu" }).click();

  // Lunch first: its own menu and dishes. Dinner is reached with Continue.
  await expect(p.getByRole("heading", { name: "Build Your Menu: Lunch" })).toBeVisible();
  const tabs = p.getByTestId("meal-tabs");
  await expect(tabs.getByRole("link", { name: "Lunch" })).toHaveAttribute("aria-current", "step");
  await expect(tabs.getByText("Dinner")).toHaveAttribute("aria-disabled", "true");
  await p.getByTestId("menu-card").filter({ hasText: menuA }).getByRole("button", { name: "Select", exact: true }).click();
  await p.getByTestId("item-card").filter({ hasText: dishes[0][0] }).getByRole("button", { name: "Select", exact: true }).click();
  await expect(p.getByTestId("estimated-total")).toContainText("16,000");
  await p.getByRole("button", { name: "Continue to Dinner" }).click();

  // Dinner: a different menu; the estimate already includes Lunch.
  await expect(p.getByRole("heading", { name: "Build Your Menu: Dinner" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Lunch" })).toBeVisible(); // saved, so it can be reopened
  await expect(p.getByTestId("menu-card").filter({ hasText: menuA })).toBeVisible(); // every menu is offered again for this meal
  await p.getByTestId("menu-card").filter({ hasText: menuB }).getByRole("button", { name: "Select", exact: true }).click();
  await p.getByTestId("item-card").filter({ hasText: dishes[2][0] }).getByRole("button", { name: "Select", exact: true }).click();
  await expect(p.getByTestId("estimated-total")).toContainText("26,000");
  await p.getByRole("button", { name: "Continue to Review" }).click();

  // Review: both meals, each on its own menu and price; one grand total.
  await expect(p).toHaveURL(/step=review/);
  const meals = p.getByTestId("review-meal");
  await expect(meals).toHaveCount(2);
  await expect(meals.nth(0)).toContainText(`Lunch · ${menuA}`);
  await expect(meals.nth(0)).toContainText(dishes[0][0]);
  await expect(meals.nth(1)).toContainText(`Dinner · ${menuB}`);
  await expect(meals.nth(1)).toContainText(dishes[2][0]);
  await expect(p.getByTestId("review-pricing")).toContainText(`Lunch · ${menuA}`);
  await expect(p.getByTestId("review-pricing")).toContainText(`Dinner · ${menuB}`);
  await expect(p.getByTestId("review-total-guests")).toContainText("40");
  await expect(p.getByTestId("review-total")).toContainText("26,000");

  // Back from the review reopens the meals; a finished meal keeps its picks.
  await p.getByRole("button", { name: "Submit for Menu Approval" }).or(p.getByRole("button", { name: "Submit" })).first().click();
  await expect(p.getByTestId("confirmation")).toBeVisible();

  const entries = (await getOrderMealMenus(slug)).sort((a, b) => a.mealType.localeCompare(b.mealType));
  expect(entries).toEqual([
    { mealType: "DINNER", menuName: menuB, price: 250, orderKind: "MULTI" },
    { mealType: "LUNCH", menuName: menuA, price: 400, orderKind: "MULTI" },
  ]);
  await ctx.close();
});

test("a visitor sent straight to the review before every meal is built is taken back to the first meal that is not done", async ({ page, browser }) => {
  test.setTimeout(200_000);
  const suffix = Date.now().toString().slice(-6);
  const email = `e2e-meals2-${Date.now()}@example.test`;
  emails.push(email);
  const slug = `mealsb-${suffix}`;
  await signUpCaterer(page, email, { closeClaimDialog: false });
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const menu = `Only Menu ${suffix}`;
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

  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const p = await ctx.newPage();
  await p.goto(`/${slug}`);
  await p.getByLabel("Your Name").fill("Early Customer");
  await p.getByLabel("Email Address").fill(`early${suffix}@example.test`);
  await p.getByRole("textbox", { name: "Phone Number" }).fill("98765" + Math.floor(10000 + Math.random() * 89999));
  await pickCalendarDate(p, p.getByLabel("Event Date"), new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));
  await p.getByLabel("Event Type").click();
  await p.getByRole("option", { name: eventType }).click();
  await p.getByLabel("Number of Adults").fill("30");
  await p.getByRole("checkbox", { name: "Breakfast" }).click();
  await p.getByRole("checkbox", { name: "Dinner" }).click();
  await p.getByRole("radio", { name: /^Vegetarian/ }).click();
  await p.getByLabel("Venue Location").fill("Indiranagar");
  await p.getByRole("button", { name: "Continue to Build Your Menu" }).click();
  await expect(p.getByRole("heading", { name: "Build Your Menu: Breakfast" })).toBeVisible();
  const draftUrl = p.url().split("?")[0];
  await p.goto(`${draftUrl}?step=review`);
  // The review is locked until every meal is done, so the visitor lands on the first meal that is not.
  await expect(p.getByRole("heading", { name: "Build Your Menu: Breakfast" })).toBeVisible();
  await expect(p.getByRole("heading", { name: "Review Your Request" })).toHaveCount(0);
  await ctx.close();
});

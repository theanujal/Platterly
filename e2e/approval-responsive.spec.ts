import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";

/**
 * The customer's approval link has three screens on one URL. None may scroll sideways on a desktop, a tablet or a phone.
 * Builds a small catalog, takes an order from the public form, sends the menu, then walks the customer through the link.
 */
import { pickCalendarDate, signUpCaterer } from "./auth-helpers";
import { submitVenueDetailsAsCustomer } from "./approval-helpers";

function toLocalIsoDate(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
const cleanupOwnerEmails: string[] = [];
test.afterEach(async () => { const e = cleanupOwnerEmails.pop(); if (e) await cleanupOnboardingTestUser(e); });

test("the approval link fits desktop, tablet and phone at every stage: review, venue & delivery and confirmation", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString().slice(-6);
  const ownerEmail = `e2e-journey-owner-${Date.now()}@example.test`;
  cleanupOwnerEmails.push(ownerEmail);
  const slug = `journey-${suffix}`;
  const customerName = `Journey Customer ${suffix}`;

  // ===== Owner: sign up, claim the link, and build the smallest catalog the storefront needs =====
  await signUpCaterer(page, ownerEmail, { firstName: "Journey", lastName: "Owner", closeClaimDialog: false });
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const menuName = `Journey Menu ${suffix}`;
  await page.goto("/menu-catalog/menus");
  await page.getByRole("button", { name: "Add Menu Type" }).click();
  await page.getByLabel("Menu Name").fill(menuName);
  await page.getByLabel("Price Per Plate").fill("400");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const categoryName = `Mains ${suffix}`;
  await page.goto("/menu-catalog/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category Name").fill(categoryName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByPlaceholder("Max selection").fill("1");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const itemName = `Paneer Tikka ${suffix}`;
  await page.goto("/menu-catalog/items");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(itemName);
  await page.getByLabel("Item Price Per Plate").fill("150");
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("checkbox", { name: categoryName }).check();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // ===== Customer: the public order flow, no login =====
  // The public form allows 15 draft starts an hour per address, and every run shares one, so each run presents its own.
  const customerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  const customerPage = await customerContext.newPage();

  await customerPage.goto(`/${slug}`);
  await customerPage.getByLabel("Your Name").fill(customerName);
  await customerPage.getByLabel("Email Address").fill(`journey-customer-${suffix}@example.test`);
  await customerPage.getByRole("textbox", { name: "Phone Number" }).fill("9876500123");
  // Two days out: the 2-day notice rule, and still inside the Kitchen Dashboard's today-through-+2-days board.
  await pickCalendarDate(customerPage, customerPage.getByLabel("Event Date"), toLocalIsoDate(new Date(Date.now() + 2 * 86_400_000)));
  await customerPage.getByLabel("Event Type").click();
  await customerPage.getByRole("option", { name: eventTypeName }).click();
  await customerPage.getByLabel("Number of Adults").fill("100");
  await customerPage.getByRole("checkbox", { name: "Dinner" }).click();
  await customerPage.getByRole("radio", { name: /^Vegetarian/ }).click();
  await customerPage.getByLabel("Venue Location").fill("Whitefield, Bangalore");
  await customerPage.getByRole("button", { name: "Continue to Build Your Menu" }).click();

  const menuCard = customerPage.getByTestId("menu-card").filter({ hasText: menuName });
  await menuCard.getByRole("button", { name: "Select", exact: true }).click();
  await customerPage.getByTestId("item-card").filter({ hasText: itemName }).getByRole("button", { name: "Select", exact: true }).click();
  await customerPage.getByRole("button", { name: "Continue to Review" }).click(); // add-ons are optional

  await expect(customerPage.getByTestId("review-total")).toHaveText("₹40,000.00"); // 400 x 100 guests
  await customerPage.getByRole("button", { name: "Submit for Menu Approval" }).click();
  await expect(customerPage.getByTestId("confirmation")).toContainText("Request Submitted Successfully!");

  // ===== Owner: the order arrived, and the menu goes out for approval =====
  const orderCard = () => page.getByTestId("order-card").filter({ hasText: customerName });
  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Pending Review");

  await page.goto("/menu-approvals");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(page.getByText(/Version 1 is with the customer/)).toBeVisible();
  const approvalPath = new URL((await page.locator("code").filter({ hasText: "/menu-approval/" }).innerText()).trim()).pathname;

  await page.goto("/orders");
  await page.getByLabel("Grid view").click();
  await expect(orderCard()).toContainText("Awaiting Customer Approval");


  const SIZES = [{ n: "desktop", w: 1280, h: 900 }, { n: "tablet", w: 820, h: 1180 }, { n: "phone", w: 390, h: 844 }];
  async function shoot(stage: string) {
    for (const sz of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h } });
      const p = await ctx.newPage();
      await p.goto(approvalPath);
      await p.waitForLoadState("networkidle");
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, sz.n + " " + stage + " scrolls sideways").toBeLessThanOrEqual(0);
      await ctx.close();
    }
  }
  await shoot("1-review");
  await customerPage.goto(approvalPath);
  await customerPage.getByRole("button", { name: "Approve Menu" }).click();
  await expect(customerPage.getByRole("heading", { name: "Venue & Delivery Details" })).toBeVisible();
  await shoot("2-venue");
  await submitVenueDetailsAsCustomer(customerPage, { building: "Journey Villa", address: "7 Journey Road", contact: "Meera", phone: "9000000007", door: "7" });
  await shoot("3-confirmation");
});

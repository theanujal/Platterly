import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, backdateStorefrontDrafts } from "./db";
import { verifyEmailViaOtp } from "./auth-helpers";

/**
 * Chunk 11 Group 11.3 + Chunk 12 — the public multi-step order flow and the
 * kitchen-side review (`/menu-approvals`, `/menu-approvals/[id]`). Builds a
 * real Menu Type + Category (capped at 1 pick) + two Food Items + Add-on +
 * Event Type, then walks an anonymous customer (cookie-less browser context)
 * through Event Details -> Choose Menu -> Choose Items (incl. the View
 * Details popup and the Extra Item popup) -> Venue -> Review -> Submit, and
 * drives the team -> customer -> kitchen approval workflow (AJ, 2026-09-26):
 * the placed order lands as Pending Review, the team sends the menu, the
 * customer requests a change through the public no-login link, the team
 * sends version 2 (version 1's link dies), the customer approves, the kitchen
 * team approves (automatic hand-off to the Kitchen Dashboard) and the Order
 * status follows every step through Completed / Cancelled. Also covers a second visitor
 * who abandons after step 1 (Abandoned Orders list) and the Iframe settings
 * page embedding the live storefront.
 *
 * Also covers Group 11.5 — the Kitchen Dashboard (`/kitchen-dashboard`),
 * redesigned 2026-09-19 (AJ, live reference screenshot): a 3-column board
 * (Pending/In Preparation/Ready only, windowed to today-through-+2-days) with a
 * free-choice status dropdown per card, plus Delivered/Cancelled moving off
 * the board entirely onto their own `/kitchen-dashboard/delivered` and
 * `/kitchen-dashboard/cancelled` list pages.
 */

// Local-date formatting, not `toISOString().slice(0, 10)` — that round-trips
// through UTC and shifts the calendar date backward in IST after ~18:30
// local time, a documented bug (order-form.tsx's `enumerateDates`) this test
// deliberately avoids repeating.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (!email) return;
  await cleanupOnboardingTestUser(email);
});

test("team sends a placed order for approval, the customer approves via a no-login link, and the kitchen team hands it to the kitchen", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const email = `e2e-menu-approvals-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const slug = `kitchen-${suffix}`;

  await page.goto("/kitchenlogin");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Approvals");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("9800000099");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("checkbox", { name: "I accept the Terms of Service and Privacy Policy" }).check();
  await page.getByRole("button", { name: "Create Platterly Account" }).click();
  await verifyEmailViaOtp(page, email);
  await expect(page).toHaveURL(/\/kitchenlogin\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // --- Claim the custom link so the storefront (and its intake form) is published ---
  await expect(page.getByRole("dialog", { name: "Claim your custom link" })).toBeVisible();
  await page.locator("#custom-slug").fill(slug);
  await page.getByRole("button", { name: "Save my link" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- A small real catalog: Menu Type -> Category (capped at 1) -> two Food Items, plus an Add-on ---
  await page.goto("/menu-catalog/menus");
  const menuName = `Wedding Menu ${suffix}`;
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
  const extraItemName = `Veg Kebab ${suffix}`;
  for (const [name, price] of [[itemName, "150"], [extraItemName, "120"]] as const) {
    await page.goto("/menu-catalog/items");
    await page.getByRole("button", { name: "Add Item" }).click();
    await page.getByLabel("Item Name").fill(name);
    await page.getByLabel("Item Price Per Plate").fill(price);
    await page.getByRole("checkbox", { name: menuName }).check();
    await page.getByRole("checkbox", { name: categoryName }).check();
    await page.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }

  const addOnName = `Live Chaat ${suffix}`;
  await page.goto("/addons");
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await page.getByLabel("Name").fill(addOnName);
  await page.getByLabel("Price", { exact: true }).fill("10"); // Per Plate by default
  await page.getByRole("button", { name: "Create add-on" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Event Type with that Menu assigned (the storefront scopes its menus to this) ---
  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/events/new");
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/events$/);

  // --- Customer walks the public flow (brand-new cookie-less context, no login) ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const customerName = `Reyansh Kapoor ${suffix}`;

  // Step 1 — Event Details (+ the pre-ticked WhatsApp/offers consent box)
  await publicPage.goto(`/${slug}`);
  await publicPage.getByLabel("Your Name").fill(customerName);
  await publicPage.getByLabel("Email Address").fill(`customer-${suffix}@example.test`);
  await publicPage.getByRole("textbox", { name: "Phone Number" }).fill("9876500000");
  // Two days out: customers need 2 days' notice (AJ, 2026-09-27), and that is
  // still inside the Kitchen Dashboard board's today-through-+2-days window.
  await publicPage.getByLabel("Event Date").fill(toLocalIsoDate(new Date(Date.now() + 2 * 86_400_000)));
  await publicPage.getByLabel("Event Type").click();
  await publicPage.getByRole("option", { name: eventTypeName }).click();
  await publicPage.getByLabel("Number of Guests").fill("100");
  await publicPage.getByLabel("Event Time").click();
  await publicPage.getByRole("option", { name: "Dinner" }).click();
  await publicPage.getByRole("radio", { name: /^Vegetarian/ }).click();
  await expect(publicPage.getByRole("checkbox", { name: /Keep me posted/ })).toBeChecked();
  await publicPage.getByRole("button", { name: "Continue to Menu Selection" }).click();
  await expect(publicPage).toHaveURL(/\/plan\/.+\?step=menu/);

  // Step 2 — Choose Menu (Custom Menu option is always offered)
  await expect(publicPage.getByTestId("custom-menu-card")).toBeVisible();
  const menuCard = publicPage.getByTestId("menu-card").filter({ hasText: menuName });
  await menuCard.getByRole("button", { name: "View details" }).click();
  await expect(publicPage.getByRole("dialog").getByText(categoryName)).toBeVisible();
  await publicPage.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
  await menuCard.getByRole("button", { name: "Select this menu" }).click();
  await expect(publicPage).toHaveURL(/step=items/);

  // Step 3 — Choose Items: add/remove only (no quantity boxes anywhere)
  await expect(publicPage.getByLabel(/Quantity/)).toHaveCount(0);
  const counter = publicPage.getByTestId("category-counter");
  await expect(counter).toHaveText("0/1");
  const tikkaCard = publicPage.getByTestId("item-card").filter({ hasText: itemName });
  await tikkaCard.getByRole("button", { name: "Add" }).click();
  await expect(counter).toHaveText("1/1");

  // The View Details popup, then adding beyond the cap opens the Extra Item popup
  const kebabCard = publicPage.getByTestId("item-card").filter({ hasText: extraItemName });
  await kebabCard.getByRole("button", { name: "View details" }).click();
  await expect(publicPage.getByRole("dialog").getByText("Vegetarian")).toBeVisible();
  await publicPage.getByRole("button", { name: "Add to Selection" }).click();
  await expect(publicPage.getByRole("dialog").getByText("Add Extra Item?")).toBeVisible();
  await expect(publicPage.getByRole("dialog").getByText(/₹120\.00 × 100 guests = ₹12,000\.00/)).toBeVisible();
  await publicPage.getByRole("button", { name: "Add as Extra Item" }).click();
  await expect(kebabCard.getByText(/Extra · ₹12,000\.00/)).toBeVisible();
  await expect(counter).toHaveText("1/1"); // the extra doesn't count toward the cap

  await publicPage.getByRole("button", { name: new RegExp(addOnName) }).click();
  await expect(publicPage.getByTestId("selection-summary")).toHaveText("2 items selected · 1 add-on");
  await publicPage.getByRole("button", { name: "Continue" }).click();
  await expect(publicPage).toHaveURL(/step=venue/);

  // Step 4 — Venue & Delivery
  await publicPage.getByLabel("Venue Type").click();
  await publicPage.getByRole("option", { name: "Home" }).click();
  await publicPage.getByLabel("Venue / Building Name").fill("Green Villa");
  await publicPage.getByLabel("Door / Flat / House No.").fill("12");
  await publicPage.getByLabel("Function Area / Hall Name").fill("Lawn");
  await publicPage.getByLabel("Complete Venue Address").fill("12 Green Villa Road");
  await publicPage.getByLabel("Venue Contact Person").fill("Ravi");
  await publicPage.getByRole("textbox", { name: "Contact Number" }).fill("9000000002");
  await publicPage.getByLabel("Vehicle Access").click();
  await publicPage.getByRole("option", { name: "Vehicle can enter venue & parking available" }).click();
  await publicPage.getByRole("button", { name: "Review Order" }).click();
  await expect(publicPage).toHaveURL(/step=review/);

  // Step 5 — Review: 400 x 100 + extra 120 x 100 + add-on 10 x 100 = 53,000
  await expect(publicPage.getByTestId("review-items")).toContainText(itemName);
  await expect(publicPage.getByTestId("review-pricing")).toContainText("Extra:");
  await expect(publicPage.getByTestId("review-total")).toHaveText("₹53,000.00");
  await publicPage.getByRole("button", { name: "Submit Request" }).click();
  await expect(publicPage.getByTestId("confirmation")).toContainText("Request Submitted Successfully!");

  // --- A second visitor abandons right after step 1 ---
  const abandonName = `Abandoner ${suffix}`;
  await publicPage.goto(`/${slug}`);
  await publicPage.getByLabel("Your Name").fill(abandonName);
  await publicPage.getByLabel("Email Address").fill(`abandon-${suffix}@example.test`);
  await publicPage.getByRole("textbox", { name: "Phone Number" }).fill("9876511111");
  await publicPage.getByLabel("Event Date").fill(toLocalIsoDate(new Date(Date.now() + 5 * 86_400_000)));
  await publicPage.getByLabel("Event Type").click();
  await publicPage.getByRole("option", { name: eventTypeName }).click();
  await publicPage.getByLabel("Number of Guests").fill("80");
  await publicPage.getByLabel("Event Time").click();
  await publicPage.getByRole("option", { name: "Lunch" }).click();
  await publicPage.getByRole("radio", { name: /^Vegetarian/ }).click();
  await publicPage.getByRole("button", { name: "Continue to Menu Selection" }).click();
  await expect(publicPage).toHaveURL(/step=menu/);
  await publicContext.close(); // ...and closes the tab without choosing a menu

  // --- Placed, not approved: the order lands as Pending Review, and the queue says the menu Needs Review ---
  const orderCard = () => page.getByTestId("order-card").filter({ hasText: customerName });
  await page.goto("/orders");
  await expect(orderCard()).toContainText("Pending Review");

  await page.goto("/menu-approvals");
  await expect(page.getByText(customerName, { exact: true })).toBeVisible();
  await expect(page.getByText("Needs Review")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page).toHaveURL(/\/menu-approvals\/.+/);

  // --- The team checks the real selections (add/remove, no quantity), then sends the menu for approval ---
  await expect(page.getByLabel(/Quantity/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Remove ${itemName}` })).toBeVisible(); // selected, and editable while Needs Review
  await expect(page.getByRole("button", { name: `Remove ${extraItemName}` })).toBeVisible();
  await expect(page.getByText("Extra", { exact: true })).toBeVisible();
  await expect(page.getByText(addOnName)).toBeVisible();
  await page.getByRole("button", { name: "Send Menu for Approval" }).click();
  await expect(page.getByText(/Version 1 is with the customer/)).toBeVisible();
  const linkV1 = new URL((await page.locator("code").filter({ hasText: "/menu-approval/" }).innerText()).trim()).pathname;

  await page.goto("/orders");
  await expect(orderCard()).toContainText("Awaiting Customer Approval");
  await expect(orderCard()).toContainText("Menu sent");

  // --- The customer opens the link: no login, no account — and asks for a change ---
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await customerPage.goto(linkV1);
  await expect(customerPage.getByRole("heading", { name: "Review & Approve Menu" })).toBeVisible();
  await expect(customerPage.getByText(customerName)).toBeVisible();
  await expect(customerPage.getByText(/Guests:\s*100/)).toBeVisible();
  await expect(customerPage.getByText(itemName)).toBeVisible();
  await customerPage.getByRole("button", { name: "Request Changes" }).click();
  await customerPage.getByLabel("What would you like to change?").fill("Please swap the starter for something lighter.");
  await customerPage.getByRole("button", { name: "Submit Request" }).click();
  await expect(customerPage.getByText("Request sent — thank you!")).toBeVisible();

  // The link is single-use: it now reads as inactive, revealing nothing else.
  await customerPage.goto(linkV1);
  await expect(customerPage.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();

  // --- Back to the team: Pending Review again, with the customer's note; they send an updated version ---
  await page.goto("/orders");
  await expect(orderCard()).toContainText("Pending Review");
  await expect(orderCard()).toContainText("Customer requested changes");
  await page.goto("/menu-approvals");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Please swap the starter for something lighter.")).toBeVisible();
  await page.getByRole("button", { name: "Send Updated Menu for Approval" }).click();
  await expect(page.getByText(/Version 2 is with the customer/)).toBeVisible();
  const linkV2 = new URL((await page.locator("code").filter({ hasText: "/menu-approval/" }).innerText()).trim()).pathname;
  expect(linkV2).not.toBe(linkV1);
  await expect(page.getByText("Superseded")).toBeVisible(); // version history: v1 can no longer be approved

  // --- The order page shows the approval next to the kitchen / status card, and the versions open in a popup (AJ, 2026-09-27) ---
  await page.goto("/orders");
  await orderCard().getByRole("link", { name: customerName }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByTestId("order-approval-panel")).toBeVisible();
  await expect(page.getByTestId("event-operations-card")).toBeVisible();
  await page.getByRole("button", { name: "Version history" }).click();
  const versions = page.getByRole("dialog", { name: "Menu version history" });
  await expect(versions.getByTestId("menu-version-row")).toHaveCount(2);
  await expect(versions.getByTestId("menu-version-row").first()).toContainText("Version 2");
  await expect(versions.getByTestId("menu-version-row").first()).toContainText("Current");
  await expect(versions.getByTestId("menu-version-row").nth(1)).toContainText("Replaced");
  await page.keyboard.press("Escape");

  // --- The customer approves the latest version; an outdated link can never approve ---
  await customerPage.goto(linkV1);
  await expect(customerPage.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();
  await customerPage.goto(linkV2);
  await customerPage.getByRole("button", { name: "Approve Menu" }).click();
  await expect(customerPage.getByText("Menu approved — thank you!")).toBeVisible();
  await customerContext.close();

  await page.goto("/orders");
  await expect(orderCard()).toContainText("Kitchen Review");

  // --- The kitchen team approves: that IS the hand-off — no separate lock step ---
  await page.goto("/menu-approvals");
  await expect(page.getByText("Needs Kitchen Review")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Approve & Send to Kitchen" }).click();
  await expect(page.getByText(/Approved and sent to the kitchen on/)).toBeVisible();
  await page.goto("/orders");
  await expect(orderCard()).toContainText("Sent to Kitchen");

  // --- Kitchen Dashboard: the freshly-approved order starts Pending, in a real board column ---
  await page.goto("/kitchen-dashboard");
  const pendingColumn = page.locator('[data-stage="PENDING"]');
  await expect(pendingColumn.getByText(customerName, { exact: true })).toBeVisible();

  // Free-choice dropdown (AJ, 2026-09-19) — jumps directly between any of
  // the 5 stages, not a forward-only single-step advance.
  const stageDropdown = pendingColumn.getByRole("combobox", { name: "Kitchen production stage" });
  await stageDropdown.click();
  await page.getByRole("option", { name: "In Preparation" }).click();
  const preparingColumn = page.locator('[data-stage="IN_PREPARATION"]');
  await expect(preparingColumn.getByText(customerName, { exact: true })).toBeVisible();

  await preparingColumn.getByRole("combobox", { name: "Kitchen production stage" }).click();
  await page.getByRole("option", { name: "Ready" }).click();
  const readyColumn = page.locator('[data-stage="READY"]');
  await expect(readyColumn.getByText(customerName, { exact: true })).toBeVisible();

  // Delivered moves it off the board entirely (AJ's screenshot has no
  // Delivered column) — only reachable via "Delivered Orders" from here on —
  // and completes the Order.
  await readyColumn.getByRole("combobox", { name: "Kitchen production stage" }).click();
  await page.getByRole("option", { name: "Delivered" }).click();
  await expect(page.locator('[data-stage]').getByText(customerName, { exact: true })).not.toBeVisible();
  await page.goto("/orders");
  await expect(orderCard()).toContainText("Completed");

  await page.goto("/kitchen-dashboard");
  await page.getByRole("button", { name: "Delivered Orders" }).click();
  await expect(page).toHaveURL(/\/kitchen-dashboard\/delivered$/);
  await expect(page.getByText(customerName, { exact: true })).toBeVisible();

  // Cancelling from the Delivered list moves it again, to Cancelled Orders, and cancels the Order.
  await page.getByRole("combobox", { name: "Kitchen production stage" }).click();
  await page.getByRole("option", { name: "Cancelled" }).click();
  await expect(page.getByText(customerName, { exact: true })).not.toBeVisible();

  await page.goto("/kitchen-dashboard/cancelled");
  await expect(page.getByText(customerName, { exact: true })).toBeVisible();
  await page.goto("/orders");
  await expect(orderCard()).toContainText("Rejected / Cancelled");

  // --- Abandoned Orders: the visitor who stopped after step 1 (already a Lead), not the one who submitted ---
  await page.goto("/abandoned-orders");
  await expect(page.getByRole("heading", { name: "Abandoned Orders" })).toBeVisible();
  await expect(page.getByText(abandonName)).toBeVisible();
  await expect(page.getByText(customerName, { exact: true })).not.toBeVisible();
  await expect(page.getByText("In progress").first()).toBeVisible(); // still within the 30-minute window

  await backdateStorefrontDrafts(slug, 45);
  await page.reload();
  await expect(page.getByText("Abandoned", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Stopped at").or(page.getByText("Choose Menu")).first()).toBeVisible();
  await expect(page.locator('a[href*="wa.me/919876511111"]')).toHaveAttribute("href", /text=.*plan/);

  // The abandoned visitor is a Lead in Customers
  await page.goto("/customers");
  await page.getByLabel("Search").fill(abandonName);
  await expect(page.getByText(abandonName)).toBeVisible();

  // --- Iframe settings: code + a live preview that really embeds the storefront ---
  await page.goto("/settings/integration/iframe");
  await expect(page.getByRole("heading", { name: "Iframe", level: 1 })).toBeVisible();
  await expect(page.getByTestId("iframe-code")).toContainText(`localhost:3000/${slug}`);
  await page.getByRole("button", { name: /Desktop/ }).click();
  await expect(page.getByTestId("iframe-code")).toContainText('width="800" height="600"');
  await expect(page.frameLocator('iframe[title="Iframe preview"]').getByLabel("Your Name")).toBeVisible();

  // Only the storefront may be framed — the admin panel refuses (clickjacking guard)
  const adminHeaders = (await page.request.get("/dashboard")).headers();
  expect(adminHeaders["content-security-policy"]).toContain("frame-ancestors 'self'");
  const storefrontHeaders = (await page.request.get(`/${slug}`)).headers();
  expect(storefrontHeaders["content-security-policy"]).toContain("frame-ancestors *");
});

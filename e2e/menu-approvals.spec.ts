import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, backdateStorefrontDrafts } from "./db";
import { pickCalendarDate, selectOption, signUpCaterer } from "./auth-helpers";

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
 * redesigned 2026-09-19 (AJ, live reference screenshot): a 4-column
 * board (Pending/In Preparation/Ready/Delivered, windowed to today-through-+2-days)
 * with a free-choice status dropdown per card; Delivered (4th column, 2026-09-30)
 * shows a small info card, and the kitchen has no Cancelled stage.
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

  await signUpCaterer(page, email, { firstName: "Approvals", lastName: "Tester", closeClaimDialog: false });

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
  await page.goto("/menu-catalog/add-ons");
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await page.getByLabel("Name").fill(addOnName);
  await page.getByLabel("Price", { exact: true }).fill("10"); // Per Plate by default
  await page.getByRole("button", { name: "Create add-on" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // A second add-on, marked included in the package: it is chosen like any other but adds nothing to the bill.
  const includedName = `Welcome Drink ${suffix}`;
  await page.getByRole("button", { name: "Add Add-on" }).click();
  await page.getByLabel("Name").fill(includedName);
  await selectOption(page, page.getByLabel("Type", { exact: true }), "Special Add-on");
  await page.getByLabel("Price", { exact: true }).fill("50");
  await page.getByRole("checkbox", { name: "Included in the package" }).check();
  await page.getByRole("button", { name: "Create add-on" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Event Type with that Menu assigned (the storefront scopes its menus to this) ---
  const eventTypeName = `Wedding ${suffix}`;
  await page.goto("/menu-catalog/event-types");
  await page.getByRole("button", { name: "Add Event Type" }).click();
  await page.getByLabel("Event Name").fill(eventTypeName);
  await page.getByRole("checkbox", { name: menuName }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // --- Customer walks the public flow (brand-new cookie-less context, no login) ---
  // The public form limits draft starts to 15 an hour per address (an in-memory counter in the dev server), and
  // every run of this suite shares one address, so each run presents its own.
  const publicContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  const publicPage = await publicContext.newPage();
  const customerName = `Reyansh Kapoor ${suffix}`;

  // Step 1 — Event Details (+ the pre-ticked WhatsApp/offers consent box)
  await publicPage.goto(`/${slug}`);
  await publicPage.getByLabel("Your Name").fill(customerName);
  await publicPage.getByLabel("Email Address").fill(`customer-${suffix}@example.test`);
  await publicPage.getByRole("textbox", { name: "Phone Number" }).fill("9876500000");
  // Two days out: customers need 2 days' notice (AJ, 2026-09-27), and that is
  // still inside the Kitchen Dashboard board's today-through-+2-days window.
  await pickCalendarDate(publicPage, publicPage.getByLabel("Event Date"), toLocalIsoDate(new Date(Date.now() + 2 * 86_400_000)));
  await publicPage.getByLabel("Event Type").click();
  await publicPage.getByRole("option", { name: eventTypeName }).click();
  await publicPage.getByLabel("Number of Guests").fill("100");
  await publicPage.getByRole("checkbox", { name: "Dinner" }).click();
  await publicPage.getByRole("radio", { name: /^Vegetarian/ }).click();
  await expect(publicPage.getByRole("checkbox", { name: /Keep me posted/ })).toBeChecked();
  await publicPage.getByRole("button", { name: "Continue to Menu Selection" }).click();
  await expect(publicPage).toHaveURL(/\/plan\/.+\?step=menu/);

  // Step 2 — Choose Menu (Custom Menu option is always offered)
  await expect(publicPage.getByTestId("custom-menu-card")).toBeVisible();
  const menuCard = publicPage.getByTestId("menu-card").filter({ hasText: menuName });
  // Search narrows the menus (the Custom Menu option stays), and clearing it brings them back.
  await publicPage.getByLabel("Search menus").fill("no such menu");
  await expect(publicPage.getByTestId("menu-card")).toHaveCount(0);
  await expect(publicPage.getByTestId("custom-menu-card")).toBeVisible();
  await publicPage.getByLabel("Search menus").fill(menuName.slice(0, 8).toLowerCase());
  await expect(menuCard).toBeVisible();
  await menuCard.getByRole("button", { name: "View details" }).click();
  // The popup names the categories only, never the dishes under them.
  await expect(publicPage.getByRole("dialog").getByText(categoryName)).toBeVisible();
  await expect(publicPage.getByRole("dialog").getByText(itemName)).toHaveCount(0);
  await publicPage.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
  // The menu step is always a grid: no Grid / List switch.
  await expect(publicPage.getByLabel("Grid view")).toHaveCount(0);
  // Nothing is picked for the customer: Continue stays off until they choose, and Select only marks the choice.
  await publicPage.getByLabel("Search menus").fill("");
  const continueButton = publicPage.getByRole("button", { name: "Continue to Menu Items" });
  await expect(continueButton).toBeDisabled();
  await menuCard.getByRole("button", { name: "Select", exact: true }).click();
  await expect(menuCard.getByRole("button", { name: "Selected" })).toBeVisible();
  await expect(publicPage).toHaveURL(/step=menu/);
  await continueButton.click();
  await expect(publicPage).toHaveURL(/step=items/);

  // Step 3 — Choose Items: Select / Selected only (no quantity boxes anywhere)
  await expect(publicPage.getByLabel(/Quantity/)).toHaveCount(0);
  const counter = publicPage.getByTestId("category-counter");
  await expect(counter).toHaveText("0/1 selected");
  // The limit is a minimum, and there is no "Show All" tab: one tab per category, the first one chosen.
  await expect(publicPage.getByText("Select at least 1 item from this category", { exact: false })).toBeVisible();
  await expect(publicPage.getByRole("tab", { name: /Show All/ })).toHaveCount(0);
  await expect(publicPage.getByRole("tab", { name: new RegExp(categoryName) })).toHaveAttribute("aria-selected", "true");
  // Finding dishes: search narrows the list, and a category can be folded.
  await publicPage.getByLabel("Search dishes").fill("zzzz");
  await expect(publicPage.getByText("No dishes match your search.")).toBeVisible();
  await publicPage.getByLabel("Search dishes").fill("");
  await expect(publicPage.getByTestId("item-card")).toHaveCount(2);
  const categoryHeader = publicPage.getByTestId("item-section").first().getByRole("button", { expanded: true }).first();
  await categoryHeader.click();
  await expect(publicPage.getByTestId("item-card")).toHaveCount(0);
  await publicPage.getByTestId("item-section").first().getByRole("button", { expanded: false }).first().click();
  await expect(publicPage.getByTestId("item-card")).toHaveCount(2);

  // The dishes are a table (Dish, Type, Status), and this step has no Grid / List switch.
  await expect(publicPage.getByLabel("Grid view")).toHaveCount(0);
  for (const heading of ["Dish", "Type", "Status"]) await expect(publicPage.getByText(heading, { exact: true })).toBeVisible();

  const tikkaCard = publicPage.getByTestId("item-card").filter({ hasText: itemName });
  const kebabCard = publicPage.getByTestId("item-card").filter({ hasText: extraItemName });
  // While a slot is free, every dish says it is included; nothing is chosen for the customer.
  await expect(tikkaCard.getByText("Included", { exact: true })).toBeVisible();
  await expect(tikkaCard.getByText("₹150.00")).toHaveCount(0); // an included dish shows no price, only extras do
  // Continuing without the category's minimum opens the Selection Required popup naming the missing category.
  await publicPage.getByRole("button", { name: "Continue to Add-ons" }).click();
  const required = publicPage.getByRole("dialog").filter({ hasText: "Selection Required" });
  await expect(required.getByText(new RegExp(`Please select at least one item from: .*${categoryName}`))).toBeVisible();
  await expect(publicPage).toHaveURL(/step=items/);
  await required.getByRole("button", { name: "OK" }).click();
  await tikkaCard.getByRole("button", { name: "Select", exact: true }).click();
  await expect(tikkaCard.getByRole("button", { name: "Selected" })).toBeVisible();
  await expect(counter).toHaveText("1/1 selected");
  // With the included pick used up, the other dish now says what it would add to the bill.
  await expect(kebabCard.getByText("Extra", { exact: true })).toBeVisible();
  await expect(kebabCard.getByText(/₹[\d,.]+ per plate/)).toBeVisible();

  // The View Details popup, then adding beyond the limit opens the Additional Option popup
  await kebabCard.getByRole("button", { name: "View details" }).click();
  await expect(publicPage.getByRole("dialog").getByText("Vegetarian")).toBeVisible();
  await publicPage.getByRole("button", { name: "Add to Selection" }).click();
  await expect(publicPage.getByRole("dialog").getByText(/is an Additional Option/)).toBeVisible();
  await expect(publicPage.getByRole("dialog").getByText(/additional charge of ₹12,000\.00/)).toBeVisible();
  await publicPage.getByRole("button", { name: "Go Back" }).click();
  await expect(kebabCard.getByRole("button", { name: "Select", exact: true })).toBeVisible(); // not selected automatically
  await kebabCard.getByRole("button", { name: "Select", exact: true }).click();
  await publicPage.getByRole("button", { name: /^Add .* \(\+₹12,000\.00\)$/ }).click();
  await expect(kebabCard.getByText("Extra", { exact: true })).toBeVisible();
  await expect(counter).toHaveText("1/1 selected"); // the extra doesn't count toward the cap
  await expect(publicPage.getByTestId("selection-summary")).toHaveText("2 items selected");
  await expect(publicPage.getByTestId("extras-summary")).toHaveText("Extras: ₹12,000.00");
  await publicPage.getByRole("button", { name: "Continue to Add-ons" }).click();

  // Step 4 — Add-ons & Live Counters (optional, its own step)
  await expect(publicPage).toHaveURL(/step=addons/);
  await expect(publicPage.getByRole("heading", { name: "Add-ons & Live Counters" })).toBeVisible();
  await expect(publicPage.getByTestId("addon-summary")).toHaveText("0 add-ons selected");
  await publicPage.getByRole("button", { name: `Select ${addOnName}` }).click();
  await expect(publicPage.getByTestId("addon-summary")).toHaveText("1 add-on selected");
  // The two groups are tabs; an add-on marked included says so and shows no price.
  await expect(publicPage.getByRole("tab", { name: /Live Counters/ })).toHaveAttribute("aria-selected", "true");
  await publicPage.getByRole("tab", { name: /^Add-ons/ }).click();
  const includedCard = publicPage.getByTestId("addon-card").filter({ hasText: includedName });
  await expect(includedCard.getByText("Included in Package")).toBeVisible();
  await expect(includedCard.getByText("₹50.00")).toHaveCount(0);
  await publicPage.getByLabel("Search add-ons").fill("zzzz");
  await expect(publicPage.getByText("Nothing matches your search.")).toBeVisible();
  await publicPage.getByLabel("Search add-ons").fill("");
  await publicPage.getByRole("button", { name: `Select ${includedName}` }).click();
  await expect(publicPage.getByTestId("addon-summary")).toHaveText("2 add-ons selected");
  await publicPage.getByRole("button", { name: "Continue to Venue & Delivery" }).click();
  await expect(publicPage).toHaveURL(/step=venue/);

  // Step 5 — Venue & Delivery
  await publicPage.getByLabel("Venue Type").click();
  await publicPage.getByRole("option", { name: "Home" }).click();
  await publicPage.getByLabel("Venue / Building Name").fill("Green Villa");
  await publicPage.getByLabel("Door / Flat / House No.").fill("12");
  await publicPage.getByLabel("Tower / Block").fill("Tower B");
  await publicPage.getByLabel("Floor").fill("2nd Floor");
  await expect(publicPage.getByLabel("Function Area / Hall Name")).toHaveCount(0); // the hall name is not asked of the customer
  await publicPage.getByLabel("Complete Venue Address").fill("12 Green Villa Road");
  await publicPage.getByLabel("Venue Contact Person").fill("Ravi");
  await publicPage.getByRole("textbox", { name: "Contact Number" }).fill("9000000002");
  await publicPage.getByLabel("Vehicle Access").click();
  await publicPage.getByRole("option", { name: "Vehicle can enter venue & parking available" }).click();
  await publicPage.getByLabel("Cooking Instructions (Optional)").fill("No onion or garlic");
  await publicPage.getByRole("checkbox", { name: "Gas / electric connection available at venue?" }).check();
  await publicPage.getByRole("button", { name: "Review Order" }).click();
  await expect(publicPage).toHaveURL(/step=review/);

  // Step 6 — Review: 400 x 100 + extra 120 x 100 + add-on 10 x 100 = 53,000
  await expect(publicPage.getByTestId("review-items")).toContainText(itemName);
  await expect(publicPage.getByTestId("review-pricing")).toContainText("Extra Items");
  await expect(publicPage.getByText("Children Guests & Pricing")).toHaveCount(0);
  await expect(publicPage.getByRole("heading", { name: "Selected Menu Items" })).toBeVisible();
  // An add-on can be taken off right here; the total only moves by what it cost (the included one cost nothing).
  await expect(publicPage.getByTestId("review-addon")).toHaveCount(2);
  await expect(publicPage.getByTestId("review-pricing")).toContainText("Included in package"); // the included add-on adds nothing
  await publicPage.getByRole("button", { name: `Remove ${includedName}` }).click();
  await expect(publicPage.getByTestId("review-addon")).toHaveCount(1);
  await expect(publicPage.getByTestId("review-total")).toHaveText("₹53,000.00");
  await publicPage.getByLabel("Additional Notes (Optional)").fill("Please call before delivery");
  await publicPage.getByRole("button", { name: "Submit Request" }).click();
  await expect(publicPage.getByTestId("confirmation")).toContainText("Request Submitted Successfully!");

  // --- A second visitor abandons right after step 1 ---
  const abandonName = `Abandoner ${suffix}`;
  await publicPage.goto(`/${slug}`);
  await publicPage.getByLabel("Your Name").fill(abandonName);
  await publicPage.getByLabel("Email Address").fill(`abandon-${suffix}@example.test`);
  await publicPage.getByRole("textbox", { name: "Phone Number" }).fill("9876511111");
  await pickCalendarDate(publicPage, publicPage.getByLabel("Event Date"), toLocalIsoDate(new Date(Date.now() + 5 * 86_400_000)));
  await publicPage.getByLabel("Event Type").click();
  await publicPage.getByRole("option", { name: eventTypeName }).click();
  await publicPage.getByLabel("Number of Guests").fill("80");
  await publicPage.getByRole("checkbox", { name: "Lunch" }).click();
  await publicPage.getByRole("radio", { name: /^Vegetarian/ }).click();
  await publicPage.getByRole("button", { name: "Continue to Menu Selection" }).click();
  await expect(publicPage).toHaveURL(/step=menu/);
  await publicContext.close(); // ...and closes the tab without choosing a menu

  // --- Placed, not approved: the order lands as Pending Review, and the queue says the menu Needs Review ---
  const orderCard = () => page.getByTestId("order-card").filter({ hasText: customerName });
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Pending Review");

  // --- What the customer typed is what the kitchen sees on the order (the fields stay in sync) ---
  await orderCard().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByLabel("Door / Flat / House No.")).toHaveValue("12");
  await expect(page.getByLabel("Tower / Block")).toHaveValue("Tower B");
  await expect(page.getByLabel("Floor")).toHaveValue("2nd Floor");
  await expect(page.getByLabel("Cooking Instructions")).toHaveValue("No onion or garlic");
  await expect(page.getByRole("checkbox", { name: "Gas / electric connection available at venue?" })).toBeChecked();
  await expect(page.getByLabel("Vehicle Access")).toContainText("Vehicle can enter venue & parking available");
  await expect(page.getByLabel("Additional Notes")).toHaveValue("Please call before delivery");

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
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Awaiting Customer Approval");
  await expect(orderCard()).toContainText("Menu sent");

  // --- The customer opens the link: no login, no account — and asks for a change ---
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await customerPage.goto(linkV1);
  await expect(customerPage.getByRole("heading", { name: "Review & Approve Menu" })).toBeVisible();
  await expect(customerPage.getByText(customerName)).toBeVisible();
  await expect(customerPage.getByText("Guests", { exact: true })).toBeVisible();
  await expect(customerPage.getByText("100", { exact: true })).toBeVisible();
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
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Pending Review");
  await expect(orderCard()).toContainText("Customer requested changes");
  await page.goto("/menu-approvals");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Please swap the starter for something lighter.")).toBeVisible();
  await page.getByRole("button", { name: "Send Updated Menu for Approval" }).click();
  await expect(page.getByText(/Version 2 is with the customer/)).toBeVisible();
  // A re-send after the first is "Customer Reviewing", not another "Awaiting Customer Approval" (AJ, 2026-09-30).
  await expect(page.getByTestId("menu-history-card").getByText("Customer Reviewing").first()).toBeVisible();
  const linkV2 = new URL((await page.locator("code").filter({ hasText: "/menu-approval/" }).innerText()).trim()).pathname;
  expect(linkV2).not.toBe(linkV1);
  await expect(page.getByText("Superseded")).toBeVisible(); // version history: v1 can no longer be approved

  // --- Older versions open read-only in the same planner, with Compare, and history stays a small card (AJ, 2026-09-30) ---
  await expect(page.getByTestId("menu-note")).toContainText("Please swap the starter for something lighter.");
  await page.getByRole("button", { name: "View version 1" }).click();
  await expect(page.getByText(/Viewing Version 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Updated Menu for Approval" })).toHaveCount(0);
  await expect(page.locator('[data-testid^="meal-slot-"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await page.getByRole("button", { name: "Compare with current" }).click();
  await expect(page.getByRole("button", { name: "Hide Compare" })).toBeVisible();
  await page.getByRole("button", { name: "Back to current" }).click();
  await expect(page.getByText(/Viewing Version 1/)).toHaveCount(0);

  // --- The order page shows the approval next to the kitchen / status card, and the versions open in a popup (AJ, 2026-09-27) ---
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await orderCard().getByRole("link", { name: customerName }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByTestId("order-approval-panel")).toBeVisible();
  await expect(page.getByTestId("event-operations-card")).toBeVisible();
  await page.getByRole("button", { name: "View History" }).click();
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

  // The customer approving makes the order Approved; the team then sends it to the kitchen itself (no kitchen review step).
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Approved");
  await page.goto("/menu-approvals");
  await expect(page.getByText("Customer Approved")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Approve & Send to Kitchen" }).click();
  await expect(page.getByText(/Approved and sent to the kitchen on/)).toBeVisible();
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Sent to Kitchen");

  // --- A status can be set by hand, but only with a reason, and the change is recorded (AJ, 2026-09-30) ---
  await orderCard().getByRole("link", { name: customerName }).click();
  await expect(page).toHaveURL(/\/orders\/.+/);
  await page.getByRole("combobox", { name: "Change status" }).click();
  await page.getByRole("option", { name: "Approved", exact: true }).click();
  const reasonDialog = page.getByRole("dialog");
  await expect(reasonDialog).toContainText("Change status to Approved?");
  await reasonDialog.getByRole("button", { name: "Change status" }).click();
  await expect(reasonDialog.getByRole("alert")).toContainText("Write a reason"); // no reason, no change
  await reasonDialog.getByLabel("Reason").fill("Customer asked us to hold it back after a call");
  await reasonDialog.getByRole("button", { name: "Change status" }).click();
  await expect(reasonDialog).not.toBeVisible();
  const history = page.getByTestId("status-history-entry").first();
  await expect(history).toContainText("Sent to Kitchen");
  await expect(history).toContainText("Manual");
  await expect(history).toContainText("Customer asked us to hold it back after a call");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Change status" })).toBeVisible();
  await expect(page.getByTestId("status-history-entry").first()).toContainText("Customer asked us to hold it back after a call");

  // The menu approval moved with the order (Approved -> Customer Approved), and it goes to the kitchen again in one click.
  await page.goto("/menu-approvals");
  await expect(page.getByText("Customer Approved")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByTestId("status-history-entry").first()).toContainText("Customer asked us to hold it back after a call");
  await page.getByRole("button", { name: "Approve & Send to Kitchen" }).click();
  await expect(page.getByText(/Approved and sent to the kitchen on/)).toBeVisible();
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Sent to Kitchen");

  // --- Kitchen Dashboard: the freshly-approved order starts Pending, in a real board column ---
  await page.goto("/kitchen-dashboard");
  const pendingColumn = page.locator('[data-stage="PENDING"]');
  await expect(pendingColumn.getByText(customerName, { exact: true })).toBeVisible();

  // View Details opens the kitchen's own prep sheet (not Menu Approvals, which the kitchen role can't open).
  await pendingColumn.getByRole("button", { name: "View Details" }).click();
  await expect(page).toHaveURL(/\/kitchen-dashboard\/.+/);
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Meals" })).toHaveCount(0); // meal tabs are for Multi Orders only
  await expect(page.getByText("Guest Qty").first()).toBeVisible();
  await expect(page.getByText("Cook for 110 portions (10% extra)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preparation Notes" })).toBeVisible();
  await expect(page.getByText("No preparation notes for this order.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  const pdfLink = page.getByRole("button", { name: "Download PDF" });
  await expect(pdfLink).toHaveAttribute("href", /\/kitchen-dashboard\/.+\/pdf\?download=1$/);
  const pdf = await page.request.get((await pdfLink.getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Kitchen Rules (Settings): the defaults show, and a change saves.
  await page.goto("/settings/kitchen/kitchen-rules");
  await expect(page.getByText("10% more than the guest count")).toBeVisible();
  await expect(page.getByText("2 days before the event")).toBeVisible();
  await page.getByRole("button", { name: "Edit Rules" }).click();
  await page.getByLabel("Send to the kitchen (days before the event)").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("3 days before the event")).toBeVisible({ timeout: 20_000 }); // first save compiles the route in dev
  await page.getByRole("button", { name: "Edit Rules" }).click();
  await page.getByLabel("Send to the kitchen (days before the event)").fill("2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("2 days before the event")).toBeVisible();

  await page.goto("/kitchen-dashboard");

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

  // Delivered is the 4th column (AJ, 2026-09-30) with a small info card, and completes the Order.
  await readyColumn.getByRole("combobox", { name: "Kitchen production stage" }).click();
  await page.getByRole("option", { name: "Delivered" }).click();
  const deliveredColumn = page.locator('[data-stage="DELIVERED"]');
  await expect(deliveredColumn.getByText(customerName, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelled Orders" })).toHaveCount(0);
  await page.goto("/orders");
  await page.getByLabel("Grid view").click(); // Orders opens in List view by default (AJ, 2026-09-30)
  await expect(orderCard()).toContainText("Completed");

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

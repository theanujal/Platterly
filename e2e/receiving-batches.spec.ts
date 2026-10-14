import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";
import { dayDisabled, isoDay, pickDate } from "./date-helpers";

/** Receiving stock in batches: partial deliveries at different costs and expiry dates, the rules, expiry warnings, FIFO order and quarantine. */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function receive(page: Page, item: string, values: { quantity: string; cost?: string; expiry?: string; lot?: string; invoice?: string }) {
  await page.getByRole("button", { name: /Receive (remaining )?stock/ }).click();
  const drawer = page.getByRole("dialog", { name: /Receive stock/ });
  if (values.invoice) await drawer.getByLabel("Invoice number (optional)").fill(values.invoice);
  await drawer.getByLabel(`Received ${item}`).fill(values.quantity);
  if (values.cost) await drawer.getByLabel(`Unit cost ${item}`).fill(values.cost);
  if (values.expiry) await pickDate(page, drawer.getByRole("button", { name: `Expiry ${item}` }), values.expiry);
  if (values.lot) await drawer.getByLabel(`Lot ${item}`).fill(values.lot);
  await drawer.getByRole("button", { name: "Add to stock" }).click();
  return drawer;
}

test("partial deliveries at different costs and expiry dates become separate batches, used oldest first; expiry rules and quarantine", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-receiving-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const [supplier, milk] = [`Dairy Farm ${suffix}`, `Paneer ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Rec", lastName: "Eiving", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  // A perishable item (Dairy needs an expiry date) and a supplier that provides it
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(milk);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Dairy" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(milk)).toBeVisible();

  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  const supplierDrawer = page.getByRole("dialog", { name: "New Supplier" });
  await supplierDrawer.getByLabel("Supplier Name").fill(supplier);
  await supplierDrawer.getByRole("button", { name: "Add a product" }).click();
  await page.getByRole("option", { name: new RegExp(milk) }).click();
  await supplierDrawer.getByRole("button", { name: "Create supplier" }).click();
  await expect(supplierDrawer).not.toBeVisible();

  // A draft for 100 kg, sent (no phone: "I sent it another way") so it can be received
  await page.goto("/purchasing/new");
  await page.getByLabel("Supplier", { exact: true }).click();
  await page.getByRole("option", { name: supplier }).click();
  await page.getByLabel("Item 1").click();
  await page.getByRole("option", { name: milk }).click();
  await page.getByLabel("Quantity 1").fill("100");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-0001" })).toBeVisible();
  await page.getByRole("button", { name: "Send via WhatsApp" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "I sent it another way" }).click();
  await page.getByRole("alertdialog", { name: "Have you sent this purchase order to the supplier?" }).getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByText("Ordered", { exact: true })).toBeVisible();

  // The rules: a cost and (for dairy) an expiry date are needed
  const drawer = await receive(page, milk, { quantity: "40" });
  await expect(drawer.locator("p[role=alert]")).toContainText("unit cost");
  await drawer.getByLabel(`Unit cost ${milk}`).fill("50");
  await drawer.getByRole("button", { name: "Add to stock" }).click();
  await expect(drawer.locator("p[role=alert]")).toContainText("expiry date");

  // The calendar is the design system's: days before today (and before the received date) are greyed out, so no backdated expiry
  expect(await dayDisabled(page, drawer.getByRole("button", { name: `Expiry ${milk}` }), isoDay(-1))).toBe(true);
  expect(await dayDisabled(page, drawer.getByRole("button", { name: `Expiry ${milk}` }), isoDay(1))).toBe(false);
  // and the received date cannot be in the future
  expect(await dayDisabled(page, drawer.getByRole("button", { name: "Received on" }), isoDay(1))).toBe(true);

  // More than is still to arrive: it is not added unless the extra is authorised with a reason
  await pickDate(page, drawer.getByRole("button", { name: `Expiry ${milk}` }), isoDay(30));
  await drawer.getByLabel(`Received ${milk}`).fill("101");
  await expect(drawer.getByTestId("extra-delivery")).toContainText("1 kg more than ordered");
  await drawer.getByRole("button", { name: "Add to stock" }).click();
  await expect(drawer.locator("p[role=alert]")).toContainText("Authorise the extra");
  // Nothing was booked by the refused attempts
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog", { name: "Discard your changes?" }).getByRole("button", { name: "Discard changes" }).click();
  await page.goto("/inventory");
  await expect(page.getByRole("row").filter({ hasText: milk })).toContainText("0 kg");

  // First delivery: 40 kg at ₹50, good for 30 days, with a lot and an invoice
  await page.goto("/purchasing");
  await page.getByRole("link", { name: "PO-0001" }).click();
  await receive(page, milk, { quantity: "40", cost: "50", expiry: isoDay(30), lot: "LOT-A", invoice: "INV-100" });
  await expect(page.getByText("Partly received", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Receive remaining stock" })).toBeVisible();

  // Second delivery: 30 kg at ₹55, expiring in 3 days
  await receive(page, milk, { quantity: "30", cost: "55", expiry: isoDay(3), lot: "LOT-B" });
  await expect(page.getByText("Partly received", { exact: true })).toBeVisible();

  // Receipt history keeps both deliveries with their own price, expiry and lot
  const history = page.locator("#receipts");
  await expect(history.getByRole("row").filter({ hasText: "LOT-A" })).toContainText("₹50.00");
  await expect(history.getByRole("row").filter({ hasText: "LOT-B" })).toContainText("₹55.00");
  await expect(history).toContainText("INV-100");

  // Stock is 70 kg; the item shows the near expiry
  await page.goto("/inventory");
  const row = page.getByRole("row").filter({ hasText: milk });
  await expect(row).toContainText("70 kg");
  await expect(row).toContainText("Expires soon");
  await expect(page.getByTestId("expiry-banner")).toContainText(milk);

  // Batches: two, oldest first; kitchen advice is to use the one that expires soonest
  await page.getByRole("button", { name: `View batches of ${milk}` }).click();
  const batches = page.getByRole("dialog", { name: /Batches/ });
  await expect(batches.getByTestId("batch-row")).toHaveCount(2);
  await expect(batches.getByTestId("batch-row").first()).toContainText("LOT-A");
  await expect(batches.getByTestId("batch-row").first()).toContainText("₹50.00");
  await expect(batches.getByTestId("fefo-advice")).toBeVisible();

  // Quarantine the first batch: it is held back, and a stock out above what is usable is refused with the reason
  await batches.getByRole("button", { name: /Quarantine batch LOT-A/ }).click();
  await expect(batches.getByTestId("batch-row").first()).toContainText("Quarantined");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `Record stock movement for ${milk}` }).click();
  const stock = page.getByRole("dialog", { name: /Stock Movement/ });
  await stock.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Stock Out" }).click();
  await stock.getByLabel(/Quantity/).fill("35");
  await stock.getByRole("button", { name: "Record movement" }).click();
  await expect(stock.getByText(/Only 30 is usable/)).toBeVisible();
  await expect(stock.getByText(/quarantined/)).toBeVisible();
});

test("free goods, an authorised extra, manual Stock In with an unknown cost that is confirmed later, tracks expiry, and one stock valuation", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-receiving2-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  const [supplier, salt] = [`Salt Works ${suffix}`, `Salt ${suffix}`];

  await signUpCaterer(page, email, { firstName: "Rec", lastName: "Two", closeClaimDialog: false });
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Add Item" }).click();
  await page.getByLabel("Item Name").fill(salt);
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Spices & Masalas" }).click();
  await page.getByLabel("Base Stock Unit", { exact: true }).click();
  await page.getByRole("option", { name: "Kilogram (kg)" }).click();
  // The category only gives the default: spices do not track expiry, dairy would
  await expect(page.getByRole("switch", { name: /Tracks expiry/ })).toHaveAttribute("aria-checked", "false");
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Dairy" }).click();
  await expect(page.getByRole("switch", { name: /Tracks expiry/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Spices & Masalas" }).click();
  await expect(page.getByRole("switch", { name: /Tracks expiry/ })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText(salt)).toBeVisible();

  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  const supplierDrawer = page.getByRole("dialog", { name: "New Supplier" });
  await supplierDrawer.getByLabel("Supplier Name").fill(supplier);
  await supplierDrawer.getByRole("button", { name: "Add a product" }).click();
  await page.getByRole("option", { name: new RegExp(salt) }).click();
  await supplierDrawer.getByRole("button", { name: "Create supplier" }).click();
  await expect(supplierDrawer).not.toBeVisible();

  await page.goto("/purchasing/new");
  await page.getByLabel("Supplier", { exact: true }).click();
  await page.getByRole("option", { name: supplier }).click();
  await page.getByLabel("Item 1").click();
  await page.getByRole("option", { name: salt }).click();
  await page.getByLabel("Quantity 1").fill("10");
  // Notes is the last thing on the form, after the items
  const itemsBox = await page.getByText("Items", { exact: true }).first().boundingBox();
  const notesBox = await page.getByLabel("Notes (optional)").boundingBox();
  expect(notesBox!.y).toBeGreaterThan(itemsBox!.y);
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-0001" })).toBeVisible();
  await page.getByRole("button", { name: "Send via WhatsApp" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "I sent it another way" }).click();
  await page.getByRole("alertdialog", { name: "Have you sent this purchase order to the supplier?" }).getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByText("Ordered", { exact: true })).toBeVisible();

  // 11 kg arrive against 10 ordered, and it is a free sample: both need a reason
  await page.getByRole("button", { name: /Receive stock/ }).click();
  const drawer = page.getByRole("dialog", { name: /Receive stock/ });
  // "Everything has arrived" is the prominent action at the top
  await expect(drawer.getByRole("button", { name: "Everything has arrived" })).toBeVisible();
  await drawer.getByLabel(`Received ${salt}`).fill("11");
  await drawer.getByLabel(`Unit cost ${salt}`).fill("0");
  await drawer.getByRole("button", { name: "Add to stock" }).click();
  await expect(drawer.locator("p[role=alert]")).toContainText("Say why it is free");
  await drawer.getByLabel(`Free reason ${salt}`).fill("Free sample");
  await drawer.getByRole("button", { name: "Add to stock" }).click();
  await expect(drawer.locator("p[role=alert]")).toContainText("Authorise the extra");
  await drawer.getByRole("checkbox", { name: `Authorise extra ${salt}` }).click();
  await drawer.getByLabel(`Extra reason ${salt}`).fill("Supplier added one kg");
  await drawer.getByRole("button", { name: "Add to stock" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  const history = page.locator("#receipts");
  await expect(history).toContainText("Free: Free sample");
  await expect(history).toContainText("1 kg above the order, authorised: Supplier added one kg");

  // The stock value counts the free batch at ₹0 (known), so the valuation is complete
  await page.goto("/inventory");
  const row = page.getByRole("row").filter({ hasText: salt });
  await expect(row).toContainText("11 kg");
  await expect(page.getByTestId("stock-value")).toContainText("₹0.00");
  await expect(page.getByTestId("stock-value")).not.toContainText("incomplete");

  // Manual Stock In must say what it cost: unknown is explicit, and the valuation becomes incomplete
  await page.getByRole("button", { name: `Record stock movement for ${salt}` }).click();
  const stock = page.getByRole("dialog", { name: /Stock Movement/ });
  await stock.getByLabel(/Quantity/).fill("5");
  await stock.getByRole("button", { name: "Record movement" }).click();
  await expect(stock.locator("p[role=alert]")).toContainText("unit cost");
  await stock.getByRole("checkbox", { name: /Cost unknown/ }).click();
  await stock.getByRole("button", { name: "Record movement" }).click();
  await expect(stock).not.toBeVisible();
  await expect(row).toContainText("16 kg");
  await expect(page.getByTestId("stock-value")).toContainText("incomplete: 1 item has stock with no known cost");

  // Confirming the cost from Batches values it, and the page, Dashboard and report use the same number
  await page.getByRole("button", { name: `View batches of ${salt}` }).click();
  const batches = page.getByRole("dialog", { name: /Batches/ });
  await expect(batches.getByTestId("batch-row")).toHaveCount(2);
  await batches.getByRole("button", { name: /Confirm cost of batch/ }).click();
  await batches.getByLabel("Unit cost").fill("20");
  await batches.getByRole("button", { name: "Save cost" }).click();
  await expect(batches.getByText("Not known")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("stock-value")).toContainText("₹100.00");
  await expect(page.getByTestId("stock-value")).not.toContainText("incomplete");

  // Switching Tracks expiry on makes the next Stock In need an expiry date
  await page.getByRole("button", { name: `Edit ${salt}` }).click();
  await page.getByRole("switch", { name: /Tracks expiry/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: `Record stock movement for ${salt}` }).click();
  const again = page.getByRole("dialog", { name: /Stock Movement/ });
  await again.getByLabel(/Quantity/).fill("2");
  await again.getByRole("checkbox", { name: /Cost unknown/ }).click();
  await again.getByRole("button", { name: "Record movement" }).click();
  await expect(again.locator("p[role=alert]")).toContainText("expiry date");
  expect(await dayDisabled(page, again.getByRole("button", { name: "Expiry date" }), isoDay(-1))).toBe(true);
});

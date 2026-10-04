import { test, expect } from "@playwright/test";
import { assignOrderEventToLocation, cleanupOnboardingTestUser, givePlanWithMultiLocation, holdMemberToLocation, seedOrderWithEvent, seedPurchaseOrder } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 23: multiple locations are opt-in. Off by default (and not offered on a plan without the feature); once
 * switched on the owner gets a header switcher, a location on inventory items, and every list follows the choice.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("locations stay hidden until the plan allows them and the kitchen switches them on", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-locations-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  const suffix = Date.now().toString().slice(-6);
  await signUpCaterer(page, email, { firstName: "Loc", lastName: "Tester", phone: "9800000066" });

  // The trial plan does not include locations: the card says so, the switch is off and disabled, no header switcher.
  await page.goto("/settings/kitchen/kitchen-rules");
  await expect(page.getByText("Not on your plan")).toBeVisible();
  await expect(page.getByRole("switch", { name: /more than one location/i })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Location" })).toHaveCount(0);

  // On a plan that includes it, the owner can switch it on and gets a default "Main" location.
  await givePlanWithMultiLocation(email);
  await page.goto("/settings/kitchen/kitchen-rules");
  const toggle = page.getByRole("switch", { name: /more than one location/i });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByText("Main", { exact: true })).toBeVisible();
  await expect(page.getByText("Default", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Location" })).toBeVisible();

  await page.getByLabel("New location name").fill("North Branch");
  await page.getByRole("button", { name: "Add Location" }).click();
  await expect(page.getByText("North Branch", { exact: true })).toBeVisible();
  await page.getByLabel("New location name").fill("north branch");
  await page.getByRole("button", { name: "Add Location" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("already have a location");

  // An inventory item at North Branch, and one shared by every location.
  await page.goto("/inventory");
  const addItem = async (name: string, location: string | null) => {
    await page.getByRole("button", { name: "Add Item" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Item Name").fill(name);
    await dialog.getByLabel("Category", { exact: true }).click();
    await page.getByRole("option", { name: "Grains & Cereals" }).click();
    await dialog.getByLabel("Unit", { exact: true }).click();
    await page.getByRole("option", { name: "Kilogram (kg)" }).click();
    if (location) {
      await dialog.getByLabel("Location", { exact: true }).click();
      await page.getByRole("option", { name: location }).click();
    }
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  };
  await addItem(`North Rice ${suffix}`, "North Branch");
  await addItem(`Shared Salt ${suffix}`, null);

  // The switcher limits the list: Main sees only the shared item, North Branch sees both.
  const switcher = page.getByRole("combobox", { name: "Location" });
  await switcher.click();
  await page.getByRole("option", { name: "Main" }).click();
  await expect(page.getByText(`Shared Salt ${suffix}`)).toBeVisible();
  await expect(page.getByText(`North Rice ${suffix}`)).toHaveCount(0);
  await switcher.click();
  await page.getByRole("option", { name: "North Branch" }).click();
  await expect(page.getByText(`North Rice ${suffix}`)).toBeVisible();
  await expect(page.getByText(`Shared Salt ${suffix}`)).toBeVisible();

  // Switching the feature off removes the switcher again.
  await page.goto("/settings/kitchen/kitchen-rules");
  await page.getByRole("switch", { name: /more than one location/i }).click();
  await expect(page.getByRole("combobox", { name: "Location" })).toHaveCount(0);
});

test("a person held to a location cannot open another location's order or sheets by typing the address", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-held-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Held", lastName: "Manager", phone: "9800000055" });
  await givePlanWithMultiLocation(email);
  await page.goto("/settings/kitchen/kitchen-rules");
  await page.getByRole("switch", { name: /more than one location/i }).click();
  await expect(page.getByText("Main", { exact: true })).toBeVisible();
  await page.getByLabel("New location name").fill("North Branch");
  await page.getByRole("button", { name: "Add Location" }).click();
  await expect(page.getByText("North Branch", { exact: true })).toBeVisible();

  const north = await seedOrderWithEvent(email);
  const main = await seedOrderWithEvent(email);
  await assignOrderEventToLocation(north.orderId, "North Branch");
  await assignOrderEventToLocation(main.orderId, "Main");
  const poNorth = await seedPurchaseOrder(email, "North Branch");
  const poMain = await seedPurchaseOrder(email, "Main");
  const poShared = await seedPurchaseOrder(email, null);
  await holdMemberToLocation(email, "North Branch");

  // Held to North Branch: its order opens, Main's is a 404, and the Orders list shows only North's.
  const own = await page.goto(`/orders/${north.orderId}`);
  expect(own?.status()).toBe(200);
  const other = await page.goto(`/orders/${main.orderId}`);
  expect(other?.status()).toBe(404);
  await page.goto("/orders");
  await expect(page.getByText(north.orderNumber).first()).toBeVisible();
  await expect(page.getByText(main.orderNumber)).toHaveCount(0);
  // Purchasing: North's order and the one tied to no location open, Main's is a 404.
  expect((await page.goto(`/purchasing/${poNorth}`))?.status()).toBe(200);
  expect((await page.goto(`/purchasing/${poShared}`))?.status()).toBe(200);
  expect((await page.goto(`/purchasing/${poMain}`))?.status()).toBe(404);
  await page.goto("/purchasing");
  await expect(page.getByText("PO-").filter({ hasText: poNorth.slice(3) })).toHaveCount(1);
  await expect(page.getByText(poMain.slice(3))).toHaveCount(0);
  // Reports and the Dashboard say or show which location they are for.
  await page.goto("/reports");
  await expect(page.getByTestId("report-location")).toContainText("North Branch");
  await expect(page.getByTestId("sales-orders")).toContainText("1");
  await page.goto("/reports?tab=storefront");
  await expect(page.getByTestId("report-location")).toContainText("orders by channel");
  await expect(page.getByTestId("sf-channels")).toBeVisible();
  await expect(page.getByTestId("sf-visits")).toHaveCount(0);
  expect((await page.goto("/dashboard"))?.status()).toBe(200);
  // No switcher for someone who is held.
  await expect(page.getByRole("combobox", { name: "Location" })).toHaveCount(0);
});

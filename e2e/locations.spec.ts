import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, givePlanWithMultiLocation } from "./db";
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

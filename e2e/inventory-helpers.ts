import type { Page } from "@playwright/test";

/** The New Inventory Item form no longer asks for cost or supplier (nor opening stock or expiry), so a spec that needs them sets them through the item's Edit form, as a user would. Assumes the item is on the page's current Inventory list. */
export async function editInventoryItem(page: Page, name: string, details: { cost?: string; supplier?: string }) {
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const dialog = page.getByRole("dialog");
  if (details.cost !== undefined) await dialog.getByLabel("Cost Per Unit").fill(details.cost);
  if (details.supplier) {
    await dialog.getByLabel("Supplier", { exact: true }).click();
    await page.getByRole("option", { name: details.supplier }).click();
  }
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await dialog.waitFor({ state: "hidden" });
}

/** Adds opening-style stock the only way the app allows: a Stock In entry. */
export async function stockIn(page: Page, name: string, quantity: string) {
  await page.getByRole("button", { name: `Record stock movement for ${name}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Quantity/).fill(quantity);
  await dialog.getByRole("button", { name: "Record movement" }).click();
  await dialog.waitFor({ state: "hidden" });
}

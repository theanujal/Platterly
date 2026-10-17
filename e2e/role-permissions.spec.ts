import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, seedOrderWithEvent, setMemberRole } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Team Management -> Manage Role Permissions (Roles & Permissions Phase B): a role list and, for the chosen role, an editor with three
 * tabs (Module Access, Actions & Operations, Sensitive Data Access). The owner changes what a role may open, do and see, it persists,
 * and Reset puts the built-in grants back. (The rules themselves are unit-tested in src/lib/auth/__tests__/role-editor.test.ts and
 * enforcement in src/modules/roles/__tests__.)
 */
const emails: string[] = [];
test.afterEach(async () => {
  const email = emails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function open(page: Page, email: string) {
  emails.push(email);
  await signUpCaterer(page, email);
  await page.goto("/settings/team?tab=permissions");
  await expect(page.getByRole("heading", { name: "Manage Role Permissions" })).toBeVisible();
}
const pickRole = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name }).click();
// The page also carries Team Management's own tabs, so the editor's three are found through their own tab list.
const tabs = (page: Page) => page.getByRole("tablist", { name: "Permission type" });
const tab = (page: Page, name: string) => tabs(page).getByRole("tab", { name });
const summary = (page: Page) => page.getByTestId("role-summary");

test("the owner changes a role across the three tabs, it persists, and reset restores the defaults", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, `e2e-roleperm-${Date.now()}@example.test`);

  // The editable roles are listed, the Admin is not.
  const roles = page.getByRole("navigation", { name: "Roles" }).getByRole("button");
  await expect(roles).toHaveCount(6);
  await expect(page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name: /^Admin/ })).toHaveCount(0);

  await pickRole(page, /^Staff/);
  await expect(summary(page)).toContainText("Opens 2 of 14 modules · 0 actions allowed · 0 of 8 sensitive items");
  await expect(tab(page, "Module Access")).toHaveAttribute("aria-selected", "true");

  // Read-only until Edit is pressed.
  const customersAccess = page.getByRole("switch", { name: "Staff: View Customers" });
  await expect(customersAccess).not.toBeChecked();
  await expect(customersAccess).toBeDisabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  // Switching role mid-edit would lose the edits, so the other roles are locked until Save or Cancel.
  await expect(page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name: /^Manager/ })).toBeDisabled();

  // Module Access: turning Customers on opens the module only.
  await customersAccess.click();
  await expect(customersAccess).toBeChecked();
  await expect(summary(page)).toContainText("Opens 3 of 14 modules · 0 actions allowed");
  await expect(page.getByText("Unsaved changes.")).toBeVisible();

  // Actions & Operations: the actions are available now; ticking Edit keeps View on.
  await tab(page, "Actions & Operations").click();
  const create = page.getByRole("checkbox", { name: "Staff: Create Customers" });
  const edit = page.getByRole("checkbox", { name: "Staff: Edit Customers" });
  await expect(create).toBeEnabled();
  await expect(create).not.toBeChecked();
  await edit.click();
  await expect(edit).toBeChecked();
  await create.click();
  await expect(summary(page)).toContainText("2 actions allowed");

  // Turning the module off again clears its actions and locks them with the reason; turning it back on leaves them cleared.
  await tab(page, "Module Access").click();
  await customersAccess.click();
  await tab(page, "Actions & Operations").click();
  await expect(edit).not.toBeChecked();
  await expect(edit).toBeDisabled();
  await expect(page.getByText("Turn on Customers in Module Access to set its actions.")).toBeVisible();
  await tab(page, "Module Access").click();
  await customersAccess.click();
  await tab(page, "Actions & Operations").click();
  await expect(edit).not.toBeChecked();
  await edit.click();
  await create.click();

  // Sensitive Data Access: independent of the modules.
  await tab(page, "Sensitive Data Access").click();
  const orderPrices = page.getByRole("switch", { name: "Staff: Order & quotation prices" });
  await expect(orderPrices).not.toBeChecked();
  await orderPrices.click();
  await expect(orderPrices).toBeChecked();
  await expect(summary(page)).toContainText("1 of 8 sensitive items");

  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("alertdialog", { name: "Save Staff permissions?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staff permissions saved." })).toBeVisible();

  // Reload: the saved grants are shown on every tab, and the role is marked as changed.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name: /^Staff/ })).toContainText("Customised");
  await pickRole(page, /^Staff/);
  await expect(page.getByRole("switch", { name: "Staff: View Customers" })).toBeChecked();
  await tab(page, "Actions & Operations").click();
  await expect(page.getByRole("checkbox", { name: "Staff: Create Customers" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Staff: Edit Customers" })).toBeChecked();
  await tab(page, "Sensitive Data Access").click();
  await expect(page.getByRole("switch", { name: "Staff: Order & quotation prices" })).toBeChecked();
  await expect(page.getByTestId("role-summary")).toContainText("2 actions allowed · 1 of 8 sensitive items");

  // Reset to defaults.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await page.getByRole("alertdialog", { name: "Reset Staff to the defaults?" }).getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staff is back to the default permissions." })).toBeVisible();
  await page.reload();
  await pickRole(page, /^Staff/);
  await expect(page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name: /^Staff/ })).not.toContainText("Customised");
  await expect(summary(page)).toContainText("Opens 2 of 14 modules · 0 actions allowed · 0 of 8 sensitive items");
});

test("the tabs work by keyboard, and each tab shows what it should", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, `e2e-roletabs-${Date.now()}@example.test`);

  await expect(tabs(page).getByRole("tab")).toHaveCount(3);
  await tab(page, "Module Access").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Actions & Operations")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Choose what this role can do inside each module");
  // Stock requests are planned, not built: listed as Coming soon, with no control to switch on.
  for (const label of ["Request stock", "Fulfil stock requests", "Receive stock"]) await expect(page.getByText(label)).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Sensitive Data Access")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("switch")).toHaveCount(8);
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Module Access")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tab(page, "Sensitive Data Access")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab(page, "Module Access")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("switch")).toHaveCount(14);
});

test("a built-in role loads exactly as its preset: Kitchen Team has no Orders or Menus, Accounts holds four sensitive keys", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, `e2e-rolepreset-${Date.now()}@example.test`);

  await pickRole(page, /^Kitchen Team/);
  await expect(summary(page)).toContainText("Opens 3 of 14 modules · 7 actions allowed · 0 of 8 sensitive items");
  await expect(page.getByRole("switch", { name: "Kitchen Team: View Kitchen Dashboard" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Kitchen Team: View Orders" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Kitchen Team: View Menu Catalog & Approvals" })).not.toBeChecked();
  await tab(page, "Actions & Operations").click();
  await expect(page.getByRole("checkbox", { name: "Kitchen Team: Update cooking status Kitchen Dashboard" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Kitchen Team: Kitchen PDF Kitchen Dashboard" })).toBeChecked();

  await pickRole(page, /^Accounts Team/);
  await tab(page, "Sensitive Data Access").click();
  await expect(page.getByRole("tabpanel").getByRole("switch", { checked: true })).toHaveCount(4);
  for (const name of ["Order & quotation prices", "Payment details", "Financial reports", "Commercial PDFs"]) {
    await expect(page.getByRole("switch", { name: `Accounts Team (Finance): ${name}` })).toBeChecked();
  }
  await expect(page.getByRole("switch", { name: "Accounts Team (Finance): Profitability" })).not.toBeChecked();
});

test("what the editor saves is enforced: Staff given order prices sees the Amount column", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-roleenforce-${Date.now()}@example.test`;
  await open(page, email);
  await seedOrderWithEvent(email);

  await pickRole(page, /^Staff/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await tab(page, "Sensitive Data Access").click();
  await page.getByRole("switch", { name: "Staff: Order & quotation prices" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("alertdialog", { name: "Save Staff permissions?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staff permissions saved." })).toBeVisible();

  // Now act as Staff: the saved key shows prices on the Orders list; without it there would be no Amount column.
  await setMemberRole(email, "staff");
  await page.goto("/orders");
  await expect(page.getByRole("columnheader", { name: "Amount" })).toBeVisible();
});

test("the editor fits a phone and a tablet: no sideways page scroll, and all three tabs stay in their row", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, `e2e-rolephone-${Date.now()}@example.test`);
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/settings/team?tab=permissions");
    await pickRole(page, /^Kitchen Team/);
    for (const name of ["Module Access", "Actions & Operations", "Sensitive Data Access"]) {
      await tab(page, name).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} at ${width}px scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
      // Only the active tab shows its name below 1280px, so the three fit their row and none is scrolled out of sight.
      const fits = await tabs(page).evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits, `the tab row overflows at ${width}px when "${name}" is active`).toBe(true);
    }
  }
});

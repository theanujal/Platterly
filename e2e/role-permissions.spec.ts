import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Team Management -> Manage Role Permissions: the owner changes what a role may do, it persists, and Reset puts the
 * built-in grants back. (Enforcement itself is covered by src/modules/roles/__tests__/role-grants.test.ts.)
 */
const emails: string[] = [];
test.afterEach(async () => {
  const email = emails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the owner changes a role's permissions, they persist, and reset restores the defaults", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-roleperm-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email);

  await page.goto("/settings/team?tab=permissions");
  await expect(page.getByRole("heading", { name: "Manage Role Permissions" })).toBeVisible();

  // Staff are read-only on customers by default.
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Staff", exact: true }).click();
  const create = page.getByRole("checkbox", { name: "Staff: Create Customers" });
  const edit = page.getByRole("checkbox", { name: "Staff: Edit Customers" });
  await expect(create).not.toBeChecked();
  // Read-only until Edit is pressed.
  await expect(edit).toBeDisabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  // Ticking Edit turns View on too; unticking View clears the rest.
  await edit.click();
  await expect(edit).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Staff: View Customers" })).toBeChecked();
  await create.click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("alertdialog", { name: "Save Staff permissions?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staff permissions saved." })).toBeVisible();

  await page.reload();
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Staff: Create Customers" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Staff: Edit Customers" })).toBeChecked();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await page.getByRole("alertdialog", { name: "Reset Staff to the defaults?" }).getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staff is back to the default permissions." })).toBeVisible();
  await page.reload();
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Staff: Create Customers" })).not.toBeChecked();
});

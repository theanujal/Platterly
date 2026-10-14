import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser } from "./db";
import { signUpCaterer } from "./auth-helpers";

/** The Create Your Custom Link pop-up (AJ, 2026-10-14): the real address, what is allowed, and a used/limit counter. */
const emails: string[] = [];
test.afterEach(async () => { const e = emails.pop(); if (e) await cleanupOnboardingTestUser(e); });

test("custom link pop-up shows the real address, the allowed characters and a 0/60 counter", async ({ page }) => {
  const email = `e2e-linkdlg-${Date.now()}@example.test`;
  emails.push(email);
  await signUpCaterer(page, email, { closeClaimDialog: false });
  const dialog = page.getByRole("dialog", { name: "Create Your Custom Link" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("slug-prefix")).toHaveText(/^catering\.(platterly\.in|localhost:3000)\/$/);
  await expect(dialog.getByText("Your custom link can only be changed once.")).toBeVisible();
  await expect(dialog.getByText("Only letters, numbers, hyphens, and underscores allowed")).toBeVisible();

  const field = dialog.locator("#custom-slug");
  await field.fill("");
  await expect(dialog.getByTestId("slug-count")).toHaveText("0/60");
  await expect(dialog.getByRole("button", { name: "Create Link" })).toBeDisabled();
  await field.fill("sharath-home-kitchen-kochi");
  await expect(field).toHaveValue("sharath-home-kitchen-kochi");
  await expect(dialog.getByTestId("slug-count")).toHaveText("26/60");
  await field.fill("a".repeat(70));
  await expect(dialog.getByTestId("slug-count")).toHaveText("60/60");
  await field.fill("bad!name");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("button", { name: "Create Link" })).toBeDisabled();
  await page.screenshot({ path: process.env.SHOT_PATH ?? "test-results/custom-link-dialog.png" });
});

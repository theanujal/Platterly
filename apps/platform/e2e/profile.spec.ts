import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { newEmail, registerAndSignIn } from "./signed-in";

/** Account profile editing, as a really signed-in person (nothing intercepted). Needs the F4 launcher, the identity database and the mail sink. */
test("a signed-in person edits first name, last name, phone and time zone, the changes survive a reload, and bad input is refused without saving", async ({ page }) => {
  const to = newEmail();
  await registerAndSignIn(page, to, "/profile");
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  // What was given at sign-up is already in the profile; the email is shown but cannot be edited here.
  await expect(page.getByLabel("First name")).toHaveValue("E2E");
  await expect(page.getByLabel("Last name")).toHaveValue("Person");
  await expect(page.getByLabel("Phone")).toHaveValue("+91 98000 00123");
  await expect(page.getByLabel("Email")).toBeDisabled();
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Kolkata");

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("First name").fill("   ");
  await page.getByLabel("Last name").fill("");
  await page.getByLabel("Phone").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter your first name.")).toBeVisible();
  await expect(page.getByText("Enter your last name.")).toBeVisible();
  await expect(page.getByText("Enter a valid phone number.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name")).toHaveValue("E2E");
  await expect(page.getByLabel("Phone")).toHaveValue("+91 98000 00123");

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("First name").fill("Asha");
  await page.getByLabel("Last name").fill("Rao  Nair");
  await page.getByLabel("Phone").fill("+91 98000 00456");
  await page.getByLabel("Time zone").selectOption("Asia/Dubai");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your details were saved.")).toBeVisible();
  await expect(page.getByLabel("Last name")).toHaveValue("Rao Nair");
  await page.reload();
  await expect(page.getByLabel("First name")).toHaveValue("Asha");
  await expect(page.getByLabel("Last name")).toHaveValue("Rao Nair");
  await expect(page.getByLabel("Phone")).toHaveValue("+91 98000 00456");
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Dubai");
  await expect(page.getByRole("heading", { name: "Asha Rao Nair" })).toBeVisible();

  if (process.env.ACCOUNT_SHOTS) {
    mkdirSync(process.env.ACCOUNT_SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.screenshot({ path: path.join(process.env.ACCOUNT_SHOTS, "profile.png"), fullPage: true });
  }
  // Product updates start off, and the choice is stored.
  const updates = page.getByRole("switch", { name: "Product updates" });
  await expect(updates).not.toBeChecked();
  await updates.check();
  await expect(updates).toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Product updates" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Security alerts" })).toBeDisabled();
});

test("saving without touching the time zone works (the default zone is accepted)", async ({ page }) => {
  await registerAndSignIn(page, newEmail(), "/profile");
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("First name").fill("Plain");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your details were saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name")).toHaveValue("Plain");
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Kolkata");
});

test("the profile API refuses a signed-out caller, a cross-site write, and ignores a body that names someone else", async ({ page, request }) => {
  expect((await request.get("/api/account/profile")).status()).toBe(401);
  expect((await request.patch("/api/account/profile", { data: { firstName: "X" } })).status()).toBe(403);
  const to = newEmail();
  await registerAndSignIn(page, to, "/profile");
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  const cross = await page.request.patch("/api/account/profile", { headers: { origin: "http://evil.localhost:3300" }, data: { firstName: "Hacked" } });
  expect(cross.status()).toBe(403);
  const sneaky = await page.request.patch("/api/account/profile", { headers: { origin: "http://account.localhost:3300" }, data: { firstName: "Real", lastName: "Name", email: "other@auth.test", userId: "someone-else", emailVerified: false } });
  expect(sneaky.status()).toBe(200);
  const body = await sneaky.json();
  expect(body.profile).toMatchObject({ name: "Real Name", firstName: "Real", email: to, emailVerified: true });
  expect((await page.request.patch("/api/account/profile", { headers: { origin: "http://account.localhost:3300" }, data: { email: "other@auth.test" } })).status()).toBe(400);
});

import { expect, test } from "@playwright/test";
import { newEmail, registerAndSignIn } from "./signed-in";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("a person adds, sees, changes and removes a profile photo; bad files are refused with a clear message", async ({ page }) => {
  await registerAndSignIn(page, newEmail(), "/profile");
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  const photo = page.locator(".pa-profile-head .pa-avatar-img");
  await expect(photo).toHaveCount(0);

  await page.locator("#pf-photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(photo).toBeVisible();
  await page.reload();
  await expect(photo).toBeVisible();
  // The same photo is the avatar in the Account's own header.
  await expect(page.locator(".pd-chip .pd-photo")).toBeVisible();
  const served = await page.request.get("/api/account/photo");
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  // A text file posing as a picture is refused, and the photo stays.
  await page.locator("#pf-photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)></svg>") });
  await expect(page.getByText("That file is not a JPEG, PNG or WebP picture.")).toBeVisible();
  await expect(photo).toBeVisible();
  // Over 2 MB is refused.
  await page.locator("#pf-photo").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]) });
  await expect(page.getByText("That photo is too large. Choose one up to 2 MB.")).toBeVisible();

  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(photo).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".pd-chip .pd-photo")).toHaveCount(0);
  expect((await page.request.get("/api/account/photo")).status()).toBe(404);
});

test("the photo route refuses a signed-out caller and a cross-site write", async ({ request }) => {
  expect((await request.get("/api/account/photo")).status()).toBe(401);
  expect((await request.put("/api/account/photo", { headers: { origin: "http://evil.localhost:3300" }, data: Buffer.from("x") })).status()).toBe(403);
  expect((await request.delete("/api/account/photo", { headers: { origin: "http://account.localhost:3300" } })).status()).toBe(401);
});

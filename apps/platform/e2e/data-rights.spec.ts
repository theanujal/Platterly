import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PASSWORD, SINK, newEmail, registerAndSignIn } from "./signed-in";

test("a person downloads their data (password asked first, no secrets inside) and asks for deletion, then withdraws it", async ({ page }) => {
  const to = newEmail();
  await registerAndSignIn(page, to, "/profile");
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();

  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByLabel("Current password").fill("not my password 1");
  await page.getByRole("button", { name: "Download my data" }).click();
  await expect(page.getByText("That is not your current password.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Download my data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("platterly-my-data.json");
  const text = readFileSync((await file.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.profile).toMatchObject({ firstName: "E2E", lastName: "Person", email: to, phone: "+919800000123" });
  expect(data.signInHistory.length).toBeGreaterThanOrEqual(1);
  for (const word of ['"password"', '"token"', "$argon", "scrypt"]) expect(text).not.toContain(word);
  await expect(page.getByText("Your data was downloaded.")).toBeVisible();

  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByLabel("Current password").fill("not my password 1");
  await page.getByRole("button", { name: "Send deletion request" }).click();
  await expect(page.getByText("That is not your current password.")).toBeVisible();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("Reason (optional)").fill("testing");
  await page.getByRole("button", { name: "Send deletion request" }).click();
  await expect(page.getByText(/Deletion requested on/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Deletion requested on/)).toBeVisible();
  const mails = (await (await page.request.get(`${SINK}/api/messages`)).json()) as { to: string[]; subject: string }[];
  expect(mails.some((m) => m.to.includes(to) && m.subject === "We received your Platterly account deletion request")).toBe(true);

  await page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(page.getByText("Your deletion request was withdrawn.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Request deletion" })).toBeVisible();
});

test("the data routes refuse a signed-out caller and a cross-site caller", async ({ request }) => {
  expect((await request.post("/api/account/export", { data: { password: "x" } })).status()).toBe(403);
  expect((await request.post("/api/account/export", { headers: { origin: "http://account.localhost:3300" }, data: { password: "x" } })).status()).toBe(401);
  expect((await request.get("/api/account/deletion")).status()).toBe(401);
  expect((await request.post("/api/account/deletion", { headers: { origin: "http://evil.localhost:3300" }, data: { password: "x" } })).status()).toBe(403);
  expect((await request.delete("/api/account/deletion", { headers: { origin: "http://account.localhost:3300" } })).status()).toBe(401);
});

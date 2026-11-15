import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { newEmail, registerAndSignIn } from "./signed-in";

/** The newsletter's unsubscribe link, as a really signed-in person. Needs AUTH_SECRET (the launcher's value) passed to the test run, like the other Account specs need the identity database. */
const SECRET = process.env.AUTH_SECRET ?? "";
const token = (userId: string) => createHmac("sha256", SECRET).update(`newsletter-unsubscribe:${userId}`).digest("base64url");

test("a bad unsubscribe link says so and changes nothing; a good one asks first, then switches the newsletter off, with no sign-in", async ({ page, browser }) => {
  test.skip(!SECRET, "AUTH_SECRET is not passed to this run");
  test.setTimeout(60_000);
  // The link is not valid without its signature, and the API refuses it.
  await page.goto("http://account.localhost:3300/unsubscribe?u=someone&t=wrong");
  await expect(page.getByRole("alert")).toContainText("This link is not valid");
  expect((await page.request.post("http://account.localhost:3300/api/newsletter/unsubscribe", { form: { u: "someone", t: "wrong" } })).status()).toBe(400);

  // A person turns the newsletter on, then uses the link from a browser that is not signed in.
  const to = newEmail();
  await registerAndSignIn(page, to, "/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  // The link carries the identity provider's person id (the one the newsletter sender holds), which only the identity database shows.
  const pool = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL });
  const userId = (await pool.query('select "id" from "user" where "email" = $1', [to])).rows[0].id as string;
  await pool.end();
  await page.getByRole("switch", { name: "Offers and announcements" }).check();
  await expect(page.getByRole("switch", { name: "Offers and announcements" })).toBeChecked();

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`http://account.localhost:3300/unsubscribe?u=${encodeURIComponent(userId)}&t=${token(userId)}`);
  await expect(stranger.getByRole("button", { name: "Unsubscribe" })).toBeVisible();
  // Opening the link alone changed nothing.
  await page.reload();
  await expect(page.getByRole("switch", { name: "Offers and announcements" })).toBeChecked();
  await stranger.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(stranger.getByRole("status")).toContainText("You have been unsubscribed");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Offers and announcements" })).not.toBeChecked();
});

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pg from "../node_modules/pg/lib/index.js";

const EMAIL = `e2e-leads-${randomBytes(4).toString("hex")}@platterly.local`;
const PASSWORD = "E2e-Only-Pass-2026";
const MARK = `lead-${randomBytes(3).toString("hex")}`;
const root = path.join(__dirname, "..");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return /^DATABASE_URL="?([^"\n]+)"?/m.exec(readFileSync(path.join(root, ".env"), "utf8"))![1];
}
const pool = new pg.Pool({ connectionString: databaseUrl() });

test.beforeAll(() => {
  execFileSync("node", ["scripts/create-staff.mjs", "E2E Leads Staff", EMAIL], { cwd: root, env: { ...process.env, OPS_STAFF_PASSWORD: PASSWORD, DATABASE_URL: databaseUrl() }, stdio: "pipe" });
});
test.afterAll(async () => {
  await pool.query("delete from notification where kind = 'lead.new' and body like $1", [`%${MARK}%`]);
  await pool.query("delete from enquiry where email like $1", [`%${MARK}%`]);
  await pool.query('delete from "user" where email = $1', [EMAIL]);
  await pool.end();
});

test("Book a demo from the website becomes a lead in Ops: it shows up as New and staff move it to Contacted with a note", async ({ page, request }) => {
  // The site posts like this (a browser from platterly.in): the public endpoint answers CORS for that origin.
  const sent = await request.post("/api/public/enquiries", {
    headers: { Origin: "https://platterly.in", "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    data: { kind: "talk", name: `Demo ${MARK}`, email: `${MARK}@example.test`, phone: "+91 98765 43210", businessType: "Wedding caterer", message: "We cater 40 events a month.", page: "/talk-to-us/", source: "platterly.in" },
  });
  expect(sent.status()).toBe(200);
  expect(sent.headers()["access-control-allow-origin"]).toBe("https://platterly.in");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("link", { name: /Leads/ }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  const lead = page.getByTestId("lead").filter({ hasText: `Demo ${MARK}` });
  await expect(lead).toContainText("New");
  await expect(lead).toContainText("Book a demo");
  await expect(lead).toContainText("Wedding caterer");
  await expect(lead).toContainText("We cater 40 events a month.");
  await expect(lead.getByRole("link", { name: `${MARK}@example.test` })).toHaveAttribute("href", `mailto:${MARK}@example.test`);

  await lead.getByLabel("Status").selectOption("CONTACTED");
  await lead.getByLabel("Note").fill("Called, demo booked for Friday");
  await lead.getByRole("button", { name: "Save" }).click();
  await expect(lead.getByRole("status")).toHaveText("Saved.");
  const row = await pool.query("select status, note, \"contactedAt\" from enquiry where email = $1", [`${MARK}@example.test`]);
  expect(row.rows[0]).toMatchObject({ status: "CONTACTED", note: "Called, demo booked for Friday" });
  expect(row.rows[0].contactedAt).not.toBeNull();

  // The Contacted tab holds it; the New tab does not.
  await page.getByRole("tab", { name: "Contacted" }).click();
  await expect(page.getByTestId("lead").filter({ hasText: `Demo ${MARK}` })).toBeVisible();
  await page.getByRole("tab", { name: "New" }).click();
  await expect(page.getByTestId("lead").filter({ hasText: `Demo ${MARK}` })).toHaveCount(0);
});

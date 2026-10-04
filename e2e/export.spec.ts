import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cleanupOnboardingTestUser, seedOrderForBilling, setMemberRole } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Chunk 24: Reports, Profitability, Expenses and the Audit Log download as CSV or Excel, with the page's own filters.
 * Anyone who can read reports gets the button and the file (what they can already see, nothing more).
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("the owner exports a report as CSV and Excel; every role that can read reports can too, and the Kitchen role cannot", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `e2e-export-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Export", lastName: "Tester", phone: "9800000044" });
  await seedOrderForBilling(email, 50_000);
  await seedOrderForBilling(email, 25_000);

  await page.goto("/reports");
  // CSV through the real button, with the figures the page shows.
  await page.getByRole("button", { name: "Export" }).click();
  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /CSV file/ }).click()]);
  expect(csvDownload.suggestedFilename()).toMatch(/-sales-report-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await csvDownload.path(), "utf8");
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("About this export");
  expect(csv).toContain('"Revenue (order totals, ₹)",75000');
  expect(csv).toContain("Revenue by month");

  // Excel is a real zip (starts with PK) with the right file type.
  await page.getByRole("button", { name: "Export" }).click();
  const [xlsxDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Excel file/ }).click()]);
  expect(xlsxDownload.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(readFileSync(await xlsxDownload.path()).subarray(0, 2).toString("latin1")).toBe("PK");

  // Every tab and every other page exports, with the filters in the address.
  for (const tab of ["sales", "events", "menu", "inventory", "finance", "storefront"]) {
    const res = await page.request.get(`/reports/export?tab=${tab}&format=csv`);
    expect(res.status(), tab).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("attachment");
    expect(await res.text()).toContain("About this export");
  }
  const dated = await page.request.get("/reports/export?tab=events&format=csv&from=2020-01-01&to=2020-01-31");
  expect(await dated.text()).toContain("2020-01-01 to 2020-01-31");
  for (const path of ["/profitability/export", "/expenses/export", "/audit-log/export"]) {
    const res = await page.request.get(`${path}?format=xlsx`);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
  }
  const profit = await (await page.request.get("/profitability/export?format=csv")).text();
  expect(profit).toContain("Revenue (₹)");
  expect(profit).toContain("50000");

  // Anyone who can read reports can download them: a manager gets the button and the files.
  await setMemberRole(email, "manager");
  await page.goto("/reports");
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  for (const path of ["/reports/export?tab=sales", "/profitability/export", "/expenses/export", "/audit-log/export"]) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }

  // The Staff role is read-only but can read reports, so it can download them too; a tab it cannot read stays closed.
  await setMemberRole(email, "staff");
  expect((await page.request.get("/reports/export?tab=sales")).status()).toBe(200);
  expect((await page.request.get("/profitability/export")).status()).toBe(403); // no expenses access
  expect((await page.request.get("/audit-log/export")).status()).toBe(403); // no audit access
  const finance = await (await page.request.get("/reports/export?tab=finance&format=csv")).text();
  expect(finance).toContain("Sales report"); // falls back to Sales: no expenses access, so no Finance tab

  // The Kitchen role has no reports at all: no button and every file is refused.
  await setMemberRole(email, "kitchen");
  for (const path of ["/reports/export?tab=sales", "/profitability/export", "/expenses/export", "/audit-log/export"]) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }
});

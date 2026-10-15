import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { cleanupOnboardingTestUser, getApprovalState, seedReviewFixture, type ReviewFixtureOptions } from "./db";
import { selectOption, signUpCaterer } from "./auth-helpers";

/**
 * The review, one state at a time (Menu Approvals + Orders merge, Phase 1). Since Phase 4 it is driven on the order's Menu Approval tab
 * (`/orders/[id]?tab=approval`); `/menu-approvals/[id]` redirects there.
 *
 * Written against the page as it was BEFORE it was split into reusable components, to pin down what must not change:
 * the buttons each stage shows, the customer-link bar and its Copy link button, the venue-details status, the custom-menu
 * price quote, Team notes, Menu History and its "View All" popup, version view with Compare, Recall to Edit and the
 * hand-made status change. `menu-approvals.spec.ts` already walks the whole send -> approve -> kitchen journey; this spec
 * covers the review-page interactions that journey does not, with orders inserted straight into each state.
 *
 * Optional: with REVIEW_SNAPSHOT_DIR set it also writes, for every state at desktop / tablet / phone width, a screenshot and
 * the page's HTML with ids, dates and tokens masked, so a refactor can be compared against a baseline taken before it
 * (`diff -r <before> <after>`). Without it nothing is written.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } } as const;

/** The review page's HTML with everything that differs between two runs masked, so two runs of the same code compare equal. */
function normalize(html: string): string {
  return html
    .replace(/ (id|for|aria-controls|aria-labelledby|aria-describedby)="[^"]*"/g, "")
    .replace(/\b(ms|ord|ev|cust|mv|mp|mi|mn|et|oi|sat)_[a-z0-9_]+/g, "ID")
        .replace(/tok_\w+/g, "TOKEN")
    .replace(/e2e-review-\d+@example\.test/g, "EMAIL")
    .replace(/ORD-\d+/g, "ORD-N")
    .replace(/\d{1,2} [A-Z][a-z]{2} \d{4}(, \d{1,2}:\d{2}\s?[ap]m)?/g, "DATE")
    .replace(/>\s+</g, "><");
}

async function dumpState(page: Page, dir: string, name: string) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(dir, `${name}-${label}.png`), fullPage: true, mask: [page.locator("header")] });
    fs.writeFileSync(path.join(dir, `${name}-${label}.html`), normalize(await page.locator("main").innerHTML()));
  }
  await page.setViewportSize(VIEWPORTS.desktop);
}

test("the review page in every state: stage buttons, customer link, venue status, price quote, notes, history, versions, recall and a hand-made status", async ({ page, context }) => {
  test.setTimeout(240_000);
  const email = `e2e-review-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUpCaterer(page, email);

  const fixtures: Record<string, ReviewFixtureOptions> = {
    custom: { ordinal: 1, customer: "Asha Custom", status: "DRAFT", customMenu: true },
    sent: { ordinal: 2, customer: "Bharat Sent", status: "SENT_TO_CUSTOMER", versions: 1, link: true },
    changes: { ordinal: 3, customer: "Chitra Changes", status: "CHANGES_REQUESTED", versions: 1, notes: [{ authorType: "CUSTOMER", body: "Please swap the starter.", versionNumber: 1 }] },
    approved: { ordinal: 4, customer: "Dev Approved", status: "CUSTOMER_APPROVED", versions: 1, link: true },
    locked: { ordinal: 5, customer: "Esha Locked", status: "FINAL_LOCKED", versions: 1, link: true, venueSubmitted: true },
    versions: { ordinal: 6, customer: "Farid Versions", status: "CUSTOMER_REVIEWING", versions: 3, link: true, notes: [{ authorType: "KITCHEN", body: "Kitchen asks for less oil.", versionNumber: 2 }] },
    manual: { ordinal: 7, customer: "Gita Manual", status: "DRAFT" },
  };
  const seeded: Record<string, { orderId: string; selectionId: string }> = {};
  for (const [key, options] of Object.entries(fixtures)) seeded[key] = await seedReviewFixture(email, options);
  // The tab's own panel: every locator below is scoped to it (the order page keeps its other panels mounted, hidden).
  const view = page.locator("#order-panel-approval");
  const open = async (key: string) => {
    await page.goto(`/orders/${seeded[key].orderId}?tab=approval`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(view.getByTestId("menu-history-card")).toBeVisible();
  };
  const actions = () => view.getByTestId("menu-approval-actions");

  // ---------- optional: baseline / comparison dump ----------
  const dumpDir = process.env.REVIEW_SNAPSHOT_DIR;
  if (dumpDir) {
    for (const key of Object.keys(fixtures)) {
      await open(key);
      await dumpState(page, dumpDir, key);
    }
    await open("versions");
    await page.goto(`/orders/${seeded.versions.orderId}?tab=approval&version=1`);
    await expect(view.getByText(/Viewing Version 1/)).toBeVisible();
    await dumpState(page, dumpDir, "versions-viewing-v1");
    await view.getByRole("button", { name: "Compare with current" }).click();
    await expect(view.getByRole("button", { name: "Hide Compare" })).toBeVisible();
    await dumpState(page, dumpDir, "versions-compare-v1");
  }

  // ---------- Needs Review, custom menu: the price quote and Team notes ----------
  await open("custom");
  await expect(view.getByText("Needs Review").first()).toBeVisible();
  await expect(actions().getByRole("button", { name: "Save Changes" })).toBeDisabled(); // nothing changed yet
  await expect(actions().getByRole("button", { name: "Send Menu for Approval" })).toBeVisible();
  await expect(actions().getByRole("button", { name: "Recall to Edit" })).toHaveCount(0);
  await expect(view.getByText("Check the dishes and the guest count, then send the menu to the customer for approval.")).toBeVisible();
  await expect(view.getByText("Customer link:")).toHaveCount(0);
  await expect(view.getByTestId("venue-details-status")).toHaveCount(0);

  await expect(view.getByText("Quote the price per plate")).toBeVisible();
  await view.getByRole("button", { name: "Save price" }).click();
  await expect(view.locator("p[role=alert]")).toContainText("Enter a price per plate of zero or more.");
  await view.locator("#ma-price").fill("250");
  await expect(view.getByText(/= ₹25,000\.00 for 100 guests/)).toBeVisible();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders/")),
    view.getByRole("button", { name: "Save price" }).click(),
  ]);
  await expect(view.locator("p[role=alert]")).toHaveCount(0);
  await page.reload();
  await expect(view.locator("#ma-price")).toHaveValue("250"); // kept on the menu selection

  const notes = view.getByTestId("menu-notes-card");
  await expect(notes).toContainText("No notes yet");
  await expect(notes.getByRole("button", { name: "Add Note" })).toBeDisabled();
  await notes.getByPlaceholder("Add a note for the team…").fill("Call the customer about the live counter.");
  await notes.getByRole("button", { name: "Add Note" }).click();
  await expect(view.getByTestId("menu-note")).toHaveCount(1);
  await expect(view.getByTestId("menu-note")).toContainText("Call the customer about the live counter.");
  await expect(view.getByTestId("menu-note").getByText("Team", { exact: true })).toBeVisible();
  await expect(notes.getByPlaceholder("Add a note for the team…")).toHaveValue(""); // the box clears

  // ---------- Sent to the customer: link bar, Copy link, Recall to Edit ----------
  await open("sent");
  await expect(view.getByText("Version 1 is with the customer")).toBeVisible();
  await expect(actions().getByRole("button", { name: "Recall to Edit" })).toBeVisible();
  await expect(actions().getByRole("button", { name: /Send (Updated )?Menu for Approval/ })).toHaveCount(0);
  const linkBar = view.locator("div").filter({ hasText: /^Customer link:/ }).last();
  const linkText = (await linkBar.locator("code").innerText()).trim();
  expect(linkText).toMatch(/\/menu-approval\/tok_/);
  await linkBar.getByRole("button", { name: "Copy link" }).click();
  await expect(linkBar.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(linkText);
  await actions().getByRole("button", { name: "Recall to Edit" }).click();
  await expect(view.getByText("Check the dishes and the guest count, then send the menu to the customer for approval.")).toBeVisible();
  await expect.poll(async () => (await getApprovalState(seeded.sent.orderId)).selection).toBe("DRAFT");
  await expect(view.getByText("Customer link:")).toHaveCount(0);

  // ---------- Changes requested: banner with the customer's note ----------
  await open("changes");
  await expect(view.getByText("The customer requested changes. Update the menu, then send a new version for approval.")).toBeVisible();
  await expect(view.getByRole("link", { name: "View Customer Note" })).toHaveAttribute("href", "#menu-notes");
  await expect(view.getByTestId("menu-note")).toContainText("Please swap the starter.");
  await expect(view.getByTestId("menu-note").getByText("Customer", { exact: true })).toBeVisible();
  await expect(actions().getByRole("button", { name: "Send Updated Menu for Approval" })).toBeVisible(); // a version was sent before

  // ---------- Customer approved: venue status, link, Recall, Approve & Send to Kitchen ----------
  await open("approved");
  await expect(view.getByText(/The customer approved version 1\./)).toBeVisible();
  const venue = view.getByTestId("venue-details-status");
  await expect(venue).toContainText("Waiting for the customer");
  await expect(venue.locator("code")).toContainText("/menu-approval/tok_");
  await venue.getByRole("button", { name: "Copy link" }).click();
  await expect(venue.getByRole("button", { name: "Copied!" })).toBeVisible();
  await expect(actions().getByRole("button", { name: "Recall to Edit" })).toBeVisible();
  await expect(actions().getByRole("button", { name: "Approve & Send to Kitchen" })).toBeVisible();

  // ---------- Sent to the kitchen: nothing left to do ----------
  await open("locked");
  await expect(view.getByText(/Approved and sent to the kitchen on .* — no further changes\./)).toBeVisible();
  await expect(view.getByTestId("venue-details-status")).toContainText("Received");
  await expect(actions().getByRole("button", { name: /Send|Recall|Approve|Save/ })).toHaveCount(0);
  // (The old page's "View Order" link has no place in the tab: the order is the page the tab is on.)

  // ---------- Several versions: History card, "View All" popup, version view, Compare ----------
  await open("versions");
  const history = view.getByTestId("menu-history-card");
  await expect(history.getByTestId("menu-version-summary")).toHaveCount(2); // the card keeps to the latest two
  await expect(history.getByRole("button", { name: "View All" })).toBeVisible();
  await expect(view.getByTestId("menu-note")).toContainText("Kitchen asks for less oil.");
  await history.getByRole("button", { name: "View All" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu version history" });
  await expect(dialog.getByTestId("menu-version-row")).toHaveCount(3);
  await expect(dialog.getByTestId("menu-version-row").first()).toContainText("Current");
  await dialog.getByTestId("menu-version-row").last().getByRole("button", { name: "View version" }).click();
  await expect(page).toHaveURL(/\?tab=approval&version=1$/);
  await expect(view.getByText(/Viewing Version 1/)).toBeVisible();
  await expect(actions().getByRole("button", { name: /Send/ })).toHaveCount(0); // a frozen version never offers Send
  await view.getByRole("button", { name: "Compare with current" }).click();
  await expect(view.getByRole("button", { name: "Hide Compare" })).toBeVisible();
  await view.getByRole("button", { name: "Back to current" }).click();
  await expect(page).not.toHaveURL(/version=/);
  await expect(view.getByText(/Viewing Version 1/)).toHaveCount(0);
  await history.getByRole("button", { name: "View version 3" }).click();
  await expect(page).toHaveURL(/\?tab=approval&version=3$/);

  // ---------- A hand-made status change needs a reason, and moves the order with it ----------
  await open("manual");
  await selectOption(page, view.getByLabel("Change status"), "Customer Approved");
  const reasonDialog = page.getByRole("dialog", { name: "Change status to Customer Approved?" });
  await reasonDialog.getByRole("button", { name: "Change status" }).click();
  await expect(reasonDialog.getByRole("alert")).toContainText("Write a reason for the change");
  await reasonDialog.getByLabel("Reason").fill("Agreed with the customer over a call");
  await reasonDialog.getByRole("button", { name: "Change status" }).click();
  await expect(reasonDialog).toBeHidden();
  await expect.poll(() => getApprovalState(seeded.manual.orderId)).toEqual({ selection: "CUSTOMER_APPROVED", order: "APPROVED" });
  await expect(view.getByTestId("status-history-entry").first()).toContainText("Manual");
  await expect(view.getByTestId("status-history-entry").first()).toContainText("Agreed with the customer over a call");
});

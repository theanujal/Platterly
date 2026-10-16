import { test, expect } from "@playwright/test";
import { cleanupOnboardingTestUser, seedApprovedOrderForShare, setOrderEventPast } from "./db";
import { signUpCaterer } from "./auth-helpers";

/**
 * Share order (AJ, 2026-10-12): after approving, the customer can share a read-only page with their family and team
 * from the Confirmation page: a link, a QR and a WhatsApp button; no prices, no phone numbers, no sign-in; they can turn
 * it off; and after the event day it says the event has ended.
 */

const cleanupEmails: string[] = [];

test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

test("customer shares the order: QR, link and WhatsApp; the page has no prices or phone numbers; turn off; event ended", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `e2e-share-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Share", lastName: "Tester", phone: "9800000099" });
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email);

  // The customer, no login, on the Confirmation page of their approval link.
  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await expect(customer.getByTestId("venue-confirmation")).toBeVisible();
  await expect(customer.getByRole("heading", { name: "Share with family & team" })).toBeVisible();
  // This kitchen has no payment method set up, so instead of the payment card the customer is told what happens next.
  await expect(customer.getByTestId("payment-later")).toContainText("Your caterer will share payment details with you.");
  // ...and it is not a dead end: what is owed, the order number to quote, and a way to call or message the kitchen (AJ, 2026-10-14).
  await expect(customer.getByTestId("payment-due")).toHaveText("₹1,000.00");
  await expect(customer.getByTestId("payment-order-number")).toContainText(/^ORD-\d+$/);
  await expect(customer.getByTestId("contact-links").first().getByRole("link", { name: /^Call / })).toHaveAttribute("href", "tel:+919800011122");
  await expect(customer.getByTestId("share-on")).toHaveCount(0);

  await customer.getByRole("button", { name: "Create share link" }).click();
  await expect(customer.getByTestId("share-on")).toBeVisible();
  await expect(customer.getByAltText("QR code for the shared page")).toBeVisible();
  await expect(customer.getByRole("button", { name: "Share on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  const shareUrl = (await customer.getByTestId("share-url").textContent())!.trim();
  expect(shareUrl).toContain("/share/");

  // Family opens the link with no login: event, menu, kitchen contact; nothing about money or the customer's contact.
  const family = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await family.goto(shareUrl);
  await expect(family.getByTestId("share-status")).toContainText("Menu approved");
  await expect(family.getByText("Hosted by Share Customer")).toBeVisible();
  await expect(family.getByText("Grand Hall, 12 MG Road")).toBeVisible();
  await expect(family.getByText("100 guests")).toBeVisible();
  await expect(family.getByTestId("share-meal")).toContainText("Paneer Tikka");
  await expect(family.getByTestId("share-meal")).toContainText("Dal Makhani");
  await expect(family.getByTestId("share-extras")).toContainText("Chaat Counter");
  await expect(family.getByTestId("share-kitchen-phone")).toHaveText("+919800011122");
  const text = await family.locator("body").innerText();
  expect(text).not.toMatch(/₹|\bprice\b|1000|2000/i);
  expect(text).not.toContain("9811122233");
  expect(text).not.toContain("share-customer@example.test");
  const overflow = await family.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Turn it off: the link stops for everyone.
  await customer.getByRole("button", { name: "Turn off sharing" }).click();
  await expect(customer.getByTestId("share-on")).toHaveCount(0);
  await family.reload();
  await expect(family.getByRole("heading", { name: "This page is not available" })).toBeVisible();

  // Switched on again, it works until the event day is over; then it says the event has ended.
  await customer.getByRole("button", { name: "Create share link" }).click();
  const second = (await customer.getByTestId("share-url").textContent())!.trim();
  expect(second).not.toBe(shareUrl);
  await family.goto(second);
  await expect(family.getByTestId("share-status")).toBeVisible();
  await setOrderEventPast(orderId, 1);
  await family.reload();
  await expect(family.getByTestId("share-ended")).toHaveText("This event has ended");
  await expect(family.getByText("Paneer Tikka")).toHaveCount(0);
});

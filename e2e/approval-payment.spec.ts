import { test, expect, type Page } from "@playwright/test";
import { cleanupOnboardingTestUser, getApprovalState, getPaymentReferences, seedApprovedOrderForShare, seedOrderPayment } from "./db";
import { selectOption, signUpCaterer } from "./auth-helpers";

/**
 * After the venue details, before the confirmation, the customer gets a payment pop-up (AJ, 2026-10-14): the advance or any
 * other amount (no full-payment option), or "Not now". A UPI payment is confirmed with the transaction number. The
 * confirmation page puts Payment, Price Summary and Venue in the wide column, and the guests read "N Guests, the breakdown on the next line".
 */
const cleanupEmails: string[] = [];
test.afterEach(async () => {
  const email = cleanupEmails.pop();
  if (email) await cleanupOnboardingTestUser(email);
});

async function setUpUpi(page: Page) {
  await page.goto("/settings/integration/payments");
  await page.getByTestId("upi-accordion").getByRole("button", { name: /UPI QR/ }).click();
  await page.getByLabel("UPI ID").fill("approvals@okhdfc");
  await page.getByLabel("Name shown in the UPI app").fill("Approval Kitchen");
  await page.getByRole("button", { name: "Save UPI" }).click();
  await expect(page.getByText("UPI saved.")).toBeVisible();
  await page.getByLabel("Advance (% of the order)").fill("40");
  await page.getByRole("button", { name: "Save Advance" }).click();
  await expect(page.getByText("Advance saved.")).toBeVisible();
}

async function fillVenueAndContinue(customer: Page) {
  await expect(customer.getByRole("heading", { name: "Venue & Delivery Details" })).toBeVisible();
  await customer.getByLabel("Venue / Building Name").fill("Green Villa");
  await customer.getByLabel("Complete Venue Address").fill("12 Green Villa Road");
  await customer.getByLabel("Contact Person").fill("Ravi");
  await customer.getByRole("textbox", { name: "Contact Number" }).fill("9000000002");
  await selectOption(customer, customer.getByLabel("Venue Type"), "Home");
  await customer.getByRole("button", { name: "Continue" }).click();
}

test("payment pop-up after the venue details: paid inside it, cannot be closed by accident, UPI needs the transaction number", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-apay-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Pay", lastName: "Tester", phone: "9800000077" });
  await setUpUpi(page);
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email, { stage: "VENUE", kidsBelow5: 10, kids5To10: 22 });

  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await fillVenueAndContinue(customer);

  // The pop-up: advance or another amount, no full payment, and a way out.
  const popup = customer.getByTestId("payment-dialog");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Secure your date");
  await expect(popup.getByRole("radio", { name: /Advance/ })).toHaveAttribute("aria-checked", "true");
  await expect(popup.getByRole("radio", { name: /Other amount/ })).toBeVisible();
  await expect(popup.getByRole("radio", { name: /Full amount|Remaining balance/ })).toHaveCount(0);
  await expect(customer.getByTestId("venue-confirmation")).toHaveCount(0); // the confirmation waits behind it

  // The pop-up cannot be closed by accident: Esc and a click outside leave it open.
  await customer.keyboard.press("Escape");
  await customer.mouse.click(5, 5);
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("button", { name: "Close" })).toHaveCount(0);

  // Pay the advance right here: the payment screen is embedded (same address), a UPI QR needs the transaction number.
  const addressBefore = customer.url();
  await popup.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(popup.getByTestId("pay-amount")).toHaveText("Pay ₹400.00"); // 40% of ₹1,000
  await expect(popup.getByTestId("upi-qr")).toBeVisible();
  expect(customer.url()).toBe(addressBefore);
  await customer.keyboard.press("Escape");
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "I have paid" }).click();
  const confirm = popup.getByTestId("upi-confirm");
  await expect(confirm.getByRole("button", { name: "Confirm payment" })).toBeDisabled(); // no number yet
  await confirm.getByLabel("Transaction number (UTR)").fill("12");
  await confirm.getByRole("button", { name: "Confirm payment" }).click();
  await expect(popup.getByRole("alert").filter({ hasText: "transaction number" })).toBeVisible();
  await confirm.getByLabel("Transaction number (UTR)").fill("412345678901");
  await confirm.getByRole("button", { name: "Confirm payment" }).click();
  await expect(popup.getByTestId("pay-done")).toContainText("we have noted your payment");
  expect(await getPaymentReferences(orderId)).toEqual([{ reference: "412345678901", status: "PENDING", amount: 400 }]);

  // Continue: the confirmation, with Price Summary then Venue in the wide column, no Payment card, guests as adults + kids.
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(customer.getByTestId("venue-confirmation")).toBeVisible();
  await expect(customer.getByTestId("payment-box")).toHaveCount(0);
  await expect(customer.getByTestId("payment-later")).toHaveCount(0);
  const priceY = (await customer.getByRole("heading", { name: "Price Summary" }).boundingBox())!.y;
  const venueY = (await customer.getByRole("heading", { name: "Your Venue & Delivery Details" }).boundingBox())!.y;
  expect(priceY).toBeLessThan(venueY);
  await expect(customer.getByTestId("approved-guests")).toContainText("132 Guests");
  await expect(customer.getByTestId("approved-guests")).toContainText("100 adults · 10 under 5 · 22 aged 5–10");
  await expect(customer.getByTestId("order-number-badge")).toContainText("ORD-");
  await expect(customer).toHaveTitle(/^Order ORD-\d+ – /);
  await expect(customer.getByTestId("contact-links").getByRole("link", { name: /^Call / })).toHaveAttribute("href", /^tel:\+\d+$/);
});

test("Not now goes straight to the confirmation, and a custom amount is paid in the pop-up", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-apay2-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Pay", lastName: "Popup", phone: "9800000078" });
  await setUpUpi(page);
  const { approvalToken } = await seedApprovedOrderForShare(email, { stage: "VENUE" });

  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await fillVenueAndContinue(customer);
  const popup = customer.getByTestId("payment-dialog");
  await popup.getByRole("radio", { name: /Other amount/ }).click();
  await popup.getByLabel(/^Amount/).fill("99999999");
  await popup.getByRole("button", { name: /^Pay / }).click();
  await expect(popup.getByRole("alert")).toContainText("more than the balance");
  await popup.getByLabel(/^Amount/).fill("250");
  await popup.getByRole("button", { name: "Pay ₹250.00" }).click();
  await expect(popup.getByTestId("pay-amount")).toHaveText("Pay ₹250.00");
  // Change amount goes back to the choice; Not now leaves for the confirmation.
  await popup.getByRole("button", { name: "Change amount" }).click();
  await expect(popup.getByRole("radio", { name: /Advance/ })).toBeVisible();
  await popup.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(customer.getByTestId("venue-confirmation")).toBeVisible();
  await expect(popup).toHaveCount(0);
});

const randomIp = () => ({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });

test("the order is not confirmed until the customer reaches the confirmation: leaving on the payment pop-up changes nothing, even on a second round", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-apay3-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Pay", lastName: "Confirm", phone: "9800000079" });
  await setUpUpi(page);
  // A menu sent again after changes: the order still carries the venue timestamp of the first round (this used to end in
  // "This link is no longer active" on the venue form, after the menu had already been approved).
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email, { stage: "REVIEW" });

  const customer = await (await browser.newContext(randomIp())).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await customer.getByRole("button", { name: "Approve Menu" }).click();
  await fillVenueAndContinue(customer);
  await expect(customer.getByTestId("payment-dialog")).toBeVisible();
  // On the pop-up the details are saved, but nothing is approved or confirmed yet.
  expect(await getApprovalState(orderId)).toEqual({ selection: "SENT_TO_CUSTOMER", order: "AWAITING_CUSTOMER_APPROVAL" });

  // Leaving here (closing the tab) leaves it unapproved: the link opens on the review again, details kept.
  await customer.reload();
  await expect(customer.getByRole("button", { name: "Approve Menu" })).toBeVisible();
  expect(await getApprovalState(orderId)).toEqual({ selection: "SENT_TO_CUSTOMER", order: "AWAITING_CUSTOMER_APPROVAL" });

  // Going on to the confirmation (Not now) is what approves the menu and confirms the order.
  await customer.getByRole("button", { name: "Approve Menu" }).click();
  await expect(customer.getByLabel("Venue / Building Name")).toHaveValue("Green Villa"); // kept from before
  await customer.getByRole("button", { name: "Continue" }).click();
  await customer.getByTestId("payment-dialog").getByRole("button", { name: "Not now", exact: true }).click();
  await expect(customer.getByTestId("venue-confirmation")).toBeVisible();
  expect(await getApprovalState(orderId)).toEqual({ selection: "CUSTOMER_APPROVED", order: "APPROVED" });
});

test("a kitchen with no online payment: Continue goes straight to the confirmation and approves", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `e2e-apay4-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Pay", lastName: "None", phone: "9800000080" });
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email, { stage: "REVIEW" });

  const customer = await (await browser.newContext(randomIp())).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await customer.getByRole("button", { name: "Approve Menu" }).click();
  await fillVenueAndContinue(customer);
  await expect(customer.getByTestId("venue-confirmation")).toBeVisible();
  await expect(customer.getByTestId("payment-dialog")).toHaveCount(0);
  expect(await getApprovalState(orderId)).toEqual({ selection: "CUSTOMER_APPROVED", order: "APPROVED" });
});

test("Pay the balance on the confirmation offers the remaining balance, not an advance", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `e2e-apay-bal-${Date.now()}@example.test`;
  cleanupEmails.push(email);
  await signUpCaterer(page, email, { firstName: "Bal", lastName: "Tester", phone: "9800000084" });
  await setUpUpi(page);
  const { approvalToken, orderId } = await seedApprovedOrderForShare(email, { stage: "CONFIRMATION" });
  await seedOrderPayment(orderId, { amount: 400, status: "CONFIRMED" });

  const customer = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await customer.goto(`/menu-approval/${approvalToken}`);
  await customer.getByRole("button", { name: "Pay the balance" }).click();
  const popup = customer.getByTestId("payment-dialog");
  await expect(popup.getByRole("heading", { name: "Pay the balance" })).toBeVisible();
  await expect(popup).toContainText("Pay what is left of your order in full, or any amount you like. Balance due: ₹600.00");
  await expect(popup).not.toContainText("venue details are in");
  await expect(popup.getByRole("radio", { name: /Remaining balance/ })).toHaveAttribute("aria-checked", "true");
  await expect(popup.getByRole("radio", { name: /Other amount/ })).toBeVisible();
  await expect(popup.getByRole("radio", { name: /Advance/ })).toHaveCount(0);
  await expect(popup.getByRole("button", { name: "Pay ₹600.00" })).toBeVisible();
});

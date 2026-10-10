import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { resolveToken } from "@/lib/secure-access/token";
import { generateInvoiceFromOrder, createInvoiceOnKitchenHandoff, InvoiceError } from "@/modules/invoices/invoice";
import { sendInvoiceDocument } from "@/modules/invoices/invoice-send";
import { confirmPayment, recordPayment, recordInitialAdvance, rejectPayment, PaymentError } from "../payment";
import { createPaymentLink, resolvePaymentLink } from "../payment-links";
import { getPaymentSettingsView, getRazorpayCredentials, saveAdvancePercent, saveGstSettings, setAutoInvoice, saveRazorpay, saveUpi, setMethodEnabled, buildUpiUri, PaymentSettingsError } from "../payment-settings";
import { decryptSecret, encryptSecret } from "../secret-box";
import { verifyCheckoutSignature, verifyWebhookSignature } from "../razorpay";
import { advanceAmount, derivePaymentState } from "../payment-math";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.notification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.paymentLink.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function makeOrderWithTotal(total = 10000, gst = false) {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Pay Test Kitchen", slug: `pay-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date(), gstShowOnInvoices: gst, gstNumber: gst ? "29ABCDE1234F1Z5" : null },
  });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Team", email: `t-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Anoop Jalota", phone: "9876543210", email: "anoop@example.test" }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventStartDate: new Date("2026-12-05"),
      eventEndDate: new Date("2026-12-05"),
      totalParticipants: 100,
      adultCount: 1, individualPricingEnabled: true,
      mealPlanEntries: [{ date: new Date("2026-12-05"), mealType: "DINNER", price: total }],
    },
    actor.id,
  );
  return { org, actor, order };
}

describe("payment math", () => {
  it("derives the payment state", () => {
    expect(derivePaymentState(1000, 0)).toBe("UNPAID");
    expect(derivePaymentState(1000, 400)).toBe("PARTIALLY_PAID");
    expect(derivePaymentState(1000, 1000)).toBe("PAID");
  });
  it("advance is a percentage but never more than what is owed", () => {
    expect(advanceAmount(10000, 0, 50)).toBe(5000);
    expect(advanceAmount(10000, 8000, 50)).toBe(2000);
    expect(advanceAmount(10000, 10000, 50)).toBe(0);
  });
});

describe("secrets", () => {
  it("round-trips and does not store the plain text", () => {
    const stored = encryptSecret("super-secret");
    expect(stored).not.toContain("super-secret");
    expect(decryptSecret(stored)).toBe("super-secret");
    expect(() => decryptSecret(stored.slice(0, -3) + "xxx")).toThrow();
  });
  it("Razorpay secrets are stored encrypted, shown masked, and kept when the form leaves them blank", async () => {
    const { org } = await makeOrderWithTotal();
    await saveRazorpay(org.id, { keyId: "rzp_test_ABCDEF1234", keySecret: "key-secret", webhookSecret: "hook-secret" });
    const view = await getPaymentSettingsView(org.id);
    expect(view.razorpay).toEqual({ connected: true, keyIdMasked: "rzp_test_••••••1234", enabled: true });
    expect(JSON.stringify(view)).not.toContain("key-secret");
    const row = await prisma.tenantSetting.findFirstOrThrow({ where: { organizationId: org.id, key: "payments.razorpay" } });
    expect(JSON.stringify(row.value)).not.toContain("key-secret");

    await saveRazorpay(org.id, { keyId: "rzp_test_ABCDEF9999", keySecret: "", webhookSecret: "" });
    expect(await getRazorpayCredentials(org.id)).toMatchObject({ keyId: "rzp_test_ABCDEF9999", keySecret: "key-secret", webhookSecret: "hook-secret" });
    await expect(saveRazorpay(org.id, { keyId: "bad", keySecret: "x", webhookSecret: "y" })).rejects.toBeInstanceOf(PaymentSettingsError);
  });
  it("validates UPI ids and the advance percentage, and builds a fixed-amount UPI link", async () => {
    const { org } = await makeOrderWithTotal();
    await expect(saveUpi(org.id, { upiId: "nope", payeeName: "Kitchen" })).rejects.toBeInstanceOf(PaymentSettingsError);
    await saveUpi(org.id, { upiId: "kitchen@okhdfc", payeeName: "Bhandary's Kitchen" });
    await expect(saveAdvancePercent(org.id, 0)).rejects.toBeInstanceOf(PaymentSettingsError);
    await saveAdvancePercent(org.id, 30);
    const view = await getPaymentSettingsView(org.id);
    expect(view.advancePercent).toBe(30);
    const uri = buildUpiUri(view.upi!, 3000, "ORD-0001");
    expect(uri).toContain("pa=kitchen%40okhdfc");
    expect(uri).toContain("am=3000.00");
  });
});

describe("which methods customers are offered", () => {
  it("a method that is set up is on by default, each can be switched off alone, and both on means both offered", async () => {
    const { org, order } = await makeOrderWithTotal(10000);
    await expect(setMethodEnabled(org.id, "upi", true)).rejects.toBeInstanceOf(PaymentSettingsError); // not set up yet
    expect((await getPaymentSettingsView(org.id)).customersCanPay).toBe(false);

    await saveUpi(org.id, { upiId: "kitchen@okhdfc", payeeName: "Kitchen" });
    await saveRazorpay(org.id, { keyId: "rzp_test_ABCDEF1234", keySecret: "s", webhookSecret: "w" });
    let view = await getPaymentSettingsView(org.id);
    expect(view.upi?.enabled).toBe(true);
    expect(view.razorpay.enabled).toBe(true);

    const { url } = await createPaymentLink({ organizationId: org.id, orderId: order.id, kind: "BALANCE" });
    const token = url.split("/pay/")[1];
    expect(await resolvePaymentLink(token)).toMatchObject({ razorpayKeyId: "rzp_test_ABCDEF1234", upi: { upiId: "kitchen@okhdfc" } });

    await setMethodEnabled(org.id, "razorpay", false);
    expect(await resolvePaymentLink(token)).toMatchObject({ razorpayKeyId: null, upi: { upiId: "kitchen@okhdfc" } });
    await setMethodEnabled(org.id, "upi", false);
    view = await getPaymentSettingsView(org.id);
    expect(view.customersCanPay).toBe(false);
    expect(await resolvePaymentLink(token)).toMatchObject({ razorpayKeyId: null, upi: null });

    await setMethodEnabled(org.id, "razorpay", true);
    await setMethodEnabled(org.id, "upi", true);
    expect(await resolvePaymentLink(token)).toMatchObject({ razorpayKeyId: "rzp_test_ABCDEF1234", upi: { upiId: "kitchen@okhdfc" } });
  });
});

describe("signatures", () => {
  it("accepts a real checkout and webhook signature and rejects a forged one", () => {
    const sig = createHmac("sha256", "secret").update("order_1|pay_1").digest("hex");
    expect(verifyCheckoutSignature({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: sig }, "secret")).toBe(true);
    expect(verifyCheckoutSignature({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_2", signature: sig }, "secret")).toBe(false);
    const body = '{"event":"payment.captured"}';
    const hook = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, hook, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body + " ", hook, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "short", "whsec")).toBe(false);
  });
});

describe("recording payments", () => {
  it("a confirmed payment drives the order's advance, balance and payment status, and makes a receipt", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 4000, type: "ADVANCE", method: "UPI", actorUserId: actor.id });
    let saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(saved.advance)).toBe(4000);
    expect(Number(saved.balance)).toBe(6000);
    expect(saved.paymentStatus).toBe("PARTIALLY_PAID");
    const receipt = await prisma.invoice.findFirstOrThrow({ where: { organizationId: org.id, type: "RECEIPT" } });
    expect(receipt.number).toBe("RCT-0001");
    expect(Number(receipt.total)).toBe(4000);

    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 6000, type: "FINAL", method: "CASH", actorUserId: actor.id });
    saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.paymentStatus).toBe("PAID");
    expect(Number(saved.balance)).toBe(0);
  });

  it("refuses an amount above the balance or below zero", async () => {
    const { org, order } = await makeOrderWithTotal(10000);
    await expect(recordPayment({ organizationId: org.id, orderId: order.id, amount: 10001, type: "FINAL", method: "CASH" })).rejects.toBeInstanceOf(PaymentError);
    await expect(recordPayment({ organizationId: org.id, orderId: order.id, amount: 0, type: "FINAL", method: "CASH" })).rejects.toBeInstanceOf(PaymentError);
  });

  it("a UPI QR claim waits for confirmation and changes nothing until then; a rejected one never counts", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    const claim = await recordPayment({ organizationId: org.id, orderId: order.id, amount: 5000, type: "ADVANCE", method: "UPI", source: "UPI_QR" });
    expect(claim.status).toBe("PENDING");
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).advance)).toBe(0);
    expect(await prisma.invoice.count({ where: { organizationId: org.id, type: "RECEIPT" } })).toBe(0);

    await confirmPayment(org.id, claim.id, actor.id);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).advance)).toBe(5000);

    const second = await recordPayment({ organizationId: org.id, orderId: order.id, amount: 1000, type: "PARTIAL", method: "UPI", source: "UPI_QR" });
    await rejectPayment(org.id, second.id, actor.id);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).advance)).toBe(5000);
    await expect(confirmPayment(org.id, second.id)).rejects.toBeInstanceOf(PaymentError);
  });

  it("the same Razorpay payment id can only ever make one payment (webhook idempotency)", async () => {
    const { org, order } = await makeOrderWithTotal(10000);
    const make = () => recordPayment({ organizationId: org.id, orderId: order.id, amount: 2000, type: "ADVANCE", method: "UPI", source: "RAZORPAY", razorpayPaymentId: "pay_same" });
    await make();
    await expect(make()).rejects.toThrow();
    expect(await prisma.payment.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("another tenant cannot touch the payment or the order", async () => {
    const a = await makeOrderWithTotal(10000);
    const b = await makeOrderWithTotal(10000);
    const payment = await recordPayment({ organizationId: a.org.id, orderId: a.order.id, amount: 100, type: "ADVANCE", method: "CASH" });
    await expect(confirmPayment(b.org.id, payment.id)).rejects.toThrow();
    await expect(recordPayment({ organizationId: b.org.id, orderId: a.order.id, amount: 100, type: "ADVANCE", method: "CASH" })).rejects.toThrow();
  });
});

describe("invoices", () => {
  it("lines add up to the order total, and a second invoice for the same order is refused", async () => {
    const { org, actor, order } = await makeOrderWithTotal(12345.67);
    const invoice = await generateInvoiceFromOrder(org.id, order.id, { actorUserId: actor.id });
    expect(invoice.number).toBe("INV-0001");
    expect(Number(invoice.total)).toBe(12345.67);
    expect(invoice.items.reduce((s, i) => s + Number(i.amount), 0)).toBeCloseTo(12345.67, 2);
    expect(invoice.gstEnabled).toBe(false);
    await expect(generateInvoiceFromOrder(org.id, order.id)).rejects.toBeInstanceOf(InvoiceError);
  });

  it("GST is carved out of the inclusive total: CGST+SGST or IGST, and the total never changes", async () => {
    const { org, order } = await makeOrderWithTotal(10500, true);
    const invoice = await generateInvoiceFromOrder(org.id, order.id, { gstRate: 5 });
    expect(Number(invoice.taxableValue)).toBe(10000);
    expect(Number(invoice.cgst)).toBe(250);
    expect(Number(invoice.sgst)).toBe(250);
    expect(Number(invoice.igst)).toBe(0);
    expect(Number(invoice.total)).toBe(10500);
    expect(invoice.businessGstNumber).toBe("29ABCDE1234F1Z5");

    const other = await makeOrderWithTotal(10500, true);
    const igst = await generateInvoiceFromOrder(other.org.id, other.order.id, { gstRate: 5, gstType: "IGST" });
    expect(Number(igst.igst)).toBe(500);
    expect(Number(igst.cgst) + Number(igst.sgst)).toBe(0);
  });

  it("the invoice status follows the confirmed payments and sending marks it Sent", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    const invoice = await generateInvoiceFromOrder(org.id, order.id);
    expect(invoice.status).toBe("DRAFT");
    const sent = await sendInvoiceDocument(org.id, invoice.id, actor.id);
    expect(sent.url).toContain("/invoice/");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("SENT");
    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 3000, type: "ADVANCE", method: "CASH" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PARTIALLY_PAID");
    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 7000, type: "FINAL", method: "CASH" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
    expect(await prisma.notification.count({ where: { organizationId: org.id, event: "invoice.sent" } })).toBe(1);
  });
});

describe("payment links", () => {
  it("an advance link uses the kitchen's advance percentage; the page resolves with the kitchen's own options", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    await saveAdvancePercent(org.id, 30);
    await saveUpi(org.id, { upiId: "kitchen@okhdfc", payeeName: "Kitchen" });
    const { link, url } = await createPaymentLink({ organizationId: org.id, orderId: order.id, kind: "ADVANCE", actorUserId: actor.id });
    expect(Number(link.amount)).toBe(3000);
    const resolved = await resolvePaymentLink(url.split("/pay/")[1]);
    expect(resolved).toMatchObject({ amount: 3000, balance: 10000, razorpayKeyId: null, upi: { upiId: "kitchen@okhdfc" } });
  });

  it("balance and custom links respect the balance, and a link stops working once the order is paid", async () => {
    const { org, order } = await makeOrderWithTotal(10000);
    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 4000, type: "ADVANCE", method: "CASH" });
    const balanceLink = await createPaymentLink({ organizationId: org.id, orderId: order.id, kind: "BALANCE" });
    expect(Number(balanceLink.link.amount)).toBe(6000);
    expect(balanceLink.link.type).toBe("FINAL");
    await expect(createPaymentLink({ organizationId: org.id, orderId: order.id, kind: "CUSTOM", amount: 6001 })).rejects.toBeInstanceOf(PaymentError);
    const token = balanceLink.url.split("/pay/")[1];
    expect(await resolvePaymentLink(token)).not.toBeNull();
    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 6000, type: "FINAL", method: "CASH" });
    expect(await resolvePaymentLink(token)).toBeNull();
  });

  it("a link token resolves only to its own tenant's link, and a wrong token to nothing", async () => {
    const a = await makeOrderWithTotal(10000);
    const { url } = await createPaymentLink({ organizationId: a.org.id, orderId: a.order.id, kind: "BALANCE" });
    const token = url.split("/pay/")[1];
    expect((await resolveToken(token))?.organizationId).toBe(a.org.id);
    expect(await resolvePaymentLink("not-a-token")).toBeNull();
  });
});

describe("GST settings (Payments page, AJ 2026-10-10)", () => {
  it("start at 5% CGST + SGST, save the number, switch, rate and type, and reject bad input", async () => {
    const { org } = await makeOrderWithTotal();
    expect((await getPaymentSettingsView(org.id)).gst).toEqual({ number: "", showOnInvoices: false, rate: 5, type: "CGST_SGST" });
    await saveGstSettings(org.id, { number: "29abcde1234f1z5", showOnInvoices: true, rate: 12, type: "IGST" });
    expect((await getPaymentSettingsView(org.id)).gst).toEqual({ number: "29ABCDE1234F1Z5", showOnInvoices: true, rate: 12, type: "IGST" });
    await expect(saveGstSettings(org.id, { number: "bad", showOnInvoices: false, rate: 5, type: "CGST_SGST" })).rejects.toBeInstanceOf(PaymentSettingsError);
    await expect(saveGstSettings(org.id, { number: "", showOnInvoices: false, rate: 40, type: "CGST_SGST" })).rejects.toBeInstanceOf(PaymentSettingsError);
    await expect(saveGstSettings(org.id, { number: "", showOnInvoices: false, rate: 5, type: "VAT" })).rejects.toBeInstanceOf(PaymentSettingsError);
    await expect(saveGstSettings(org.id, { number: "", showOnInvoices: true, rate: 5, type: "IGST" })).rejects.toBeInstanceOf(PaymentSettingsError);
  });

  it("the saved rate and type are the defaults for a new invoice, and a manual rate still overrides them", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000, true);
    await saveGstSettings(org.id, { number: "29ABCDE1234F1Z5", showOnInvoices: true, rate: 12, type: "IGST" });
    const invoice = await generateInvoiceFromOrder(org.id, order.id, { actorUserId: actor.id });
    expect([Number(invoice.gstRate), invoice.gstType, Number(invoice.igst)]).toEqual([12, "IGST", 1071.43]);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
    const manual = await generateInvoiceFromOrder(org.id, order.id, { gstRate: 18, gstType: "CGST_SGST", actorUserId: actor.id });
    expect([Number(manual.gstRate), manual.gstType]).toEqual([18, "CGST_SGST"]);
  });
});

describe("the invoice is created when the order is sent to the kitchen (AJ, 2026-10-10)", () => {
  it("creates a Draft once, with the saved GST defaults, and does nothing the second time", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000, true);
    await saveGstSettings(org.id, { number: "29ABCDE1234F1Z5", showOnInvoices: true, rate: 12, type: "CGST_SGST" });
    const invoice = await createInvoiceOnKitchenHandoff(org.id, order.id, actor.id);
    expect(invoice).toMatchObject({ status: "DRAFT", type: "INVOICE" });
    expect(Number(invoice?.gstRate)).toBe(12);
    expect(Number(invoice?.total)).toBe(10000);
    expect(await createInvoiceOnKitchenHandoff(org.id, order.id, actor.id)).toBeNull();
    expect(await prisma.invoice.count({ where: { orderId: order.id, type: "INVOICE" } })).toBe(1);
  });

  it("is skipped when switched off, when there is no amount, and for a cancelled order; a cancelled invoice can be replaced", async () => {
    const off = await makeOrderWithTotal();
    await setAutoInvoice(off.org.id, false);
    expect(await createInvoiceOnKitchenHandoff(off.org.id, off.order.id, off.actor.id)).toBeNull();

    const empty = await makeOrderWithTotal(0);
    expect(await createInvoiceOnKitchenHandoff(empty.org.id, empty.order.id, empty.actor.id)).toBeNull();

    const cancelled = await makeOrderWithTotal();
    await prisma.order.update({ where: { id: cancelled.order.id }, data: { status: "CANCELLED" } });
    expect(await createInvoiceOnKitchenHandoff(cancelled.org.id, cancelled.order.id, cancelled.actor.id)).toBeNull();

    const replaced = await makeOrderWithTotal();
    const first = await createInvoiceOnKitchenHandoff(replaced.org.id, replaced.order.id, replaced.actor.id);
    await prisma.invoice.update({ where: { id: first!.id }, data: { status: "CANCELLED" } });
    expect(await createInvoiceOnKitchenHandoff(replaced.org.id, replaced.order.id, replaced.actor.id)).not.toBeNull();
  });

  it("never throws: a failure is logged and the hand-off carries on", async () => {
    const { org, actor } = await makeOrderWithTotal();
    expect(await createInvoiceOnKitchenHandoff(org.id, "no-such-order", actor.id)).toBeNull();
  });
});

describe("the advance is recorded as a real payment (AJ, 2026-10-10)", () => {
  it("an advance with a method books a confirmed Advance payment and a receipt, and the order follows", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    expect(await recordInitialAdvance(org.id, order.id, { amount: 3000, paidInFull: false, method: "UPI", reference: "UPI-123" }, actor.id)).toBeNull();
    const payments = await prisma.payment.findMany({ where: { orderId: order.id }, include: { receipt: true } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ type: "ADVANCE", method: "UPI", status: "CONFIRMED", reference: "UPI-123" });
    expect(payments[0].receipt?.number).toMatch(/^RCT-/);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([Number(after.advance), Number(after.balance), after.paymentStatus]).toEqual([3000, 7000, "PARTIALLY_PAID"]);
  });

  it("a later payment adds to the advance instead of replacing it", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    await recordInitialAdvance(org.id, order.id, { amount: 5000, paidInFull: false, method: "CASH" }, actor.id);
    await recordPayment({ organizationId: org.id, orderId: order.id, amount: 2000, type: "PARTIAL", method: "CASH", actorUserId: actor.id });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([Number(after.advance), Number(after.balance)]).toEqual([7000, 3000]);
  });

  it("'Paid' records the whole balance as the final payment, an advance above the total is refused, and nothing is recorded for zero", async () => {
    const paid = await makeOrderWithTotal(10000);
    expect(await recordInitialAdvance(paid.org.id, paid.order.id, { amount: 0, paidInFull: true, method: "CARD" }, paid.actor.id)).toBeNull();
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: paid.order.id } });
    expect([Number(payment.amount), payment.type, payment.method]).toEqual([10000, "FINAL", "CARD"]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: paid.order.id } })).paymentStatus).toBe("PAID");

    const over = await makeOrderWithTotal(10000);
    expect(await recordInitialAdvance(over.org.id, over.order.id, { amount: 20000, paidInFull: false }, over.actor.id)).toMatch(/more than the balance/);
    expect(await prisma.payment.count({ where: { orderId: over.order.id } })).toBe(0);

    const none = await makeOrderWithTotal(10000);
    expect(await recordInitialAdvance(none.org.id, none.order.id, { amount: 0, paidInFull: false }, none.actor.id)).toBeNull();
    expect(await prisma.payment.count({ where: { orderId: none.order.id } })).toBe(0);
  });

  it("an unknown method falls back to cash", async () => {
    const { org, actor, order } = await makeOrderWithTotal(10000);
    await recordInitialAdvance(org.id, order.id, { amount: 1000, paidInFull: false, method: "BITCOIN" }, actor.id);
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).method).toBe("CASH");
  });
});

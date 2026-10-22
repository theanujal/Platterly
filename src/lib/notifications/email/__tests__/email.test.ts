import { describe, it, expect, afterEach, vi } from "vitest";
import { verificationCodeEmail, teamInvitationEmail, emailForEvent, passwordResetEmail } from "../templates";
import { sendEmail } from "../zeptomail";
import { escapeHtml } from "../layout";
import { emailMessageFor } from "@/modules/notifications/channel-settings-config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("email templates", () => {
  it("renders the 6-digit code in the shared layout", () => {
    const { subject, html } = verificationCodeEmail("721398", 10);
    expect(subject).toBe("Platterly Account Verification");
    expect(html).toContain("Verify your Platterly account");
    expect(html).toContain("721398");
    expect(html).toContain("Valid for 10 minutes");
    expect(html).toContain("Team Platterly");
  });

  it("escapes values in the invitation", () => {
    const { html } = teamInvitationEmail({ organizationName: "<b>Evil</b>", inviterName: "A", acceptUrl: "https://x.test/a?b=1&c=2", expiresInHours: 48 });
    expect(html).not.toContain("<b>Evil</b>");
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });

});

describe("sendEmail (ZeptoMail)", () => {
  it("never has the real token from .env in a test run", () => {
    expect(process.env.ZEPTOMAIL_TOKEN).toBeUndefined();
  });

  it("skips when not configured", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "");
    expect((await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" })).status).toBe("skipped");
  });

  it("posts to the API and reports the request id", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
    expect(result).toEqual({ status: "sent", providerMessageId: "req-1" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe("Zoho-enczapikey abc");
    expect(JSON.parse(init.body).to[0].email_address.address).toBe("a@b.test");
  });

  it("reports a rejected request as failed", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "bad token" }), { status: 401 })));
    const result = await sendEmail({ to: "a@b.test", subject: "s", html: "x" });
    expect(result.status).toBe("failed");
  });
});

describe("every email template", () => {
  const data = {
    kitchenName: "Spice Route", customerName: "Asha", orderNumber: "ORD-1", eventDate: "12 Nov 2026", eventAddress: "Hall 1", eventType: "Wedding",
    amount: 12500, balance: 2500, number: "INV-1", url: "https://catering.platterly.in/x", versionNumber: 2, status: "APPROVED",
  };
  const events = [
    "order.created", "order.new_alert", "order.status_changed", "quotation.sent", "quotation.converted", "menu_approval.sent", "invoice.sent", "receipt.sent",
    "payment.link_sent", "payment.received", "payment.upi_claimed", "payment.due", "payment.overdue", "event.reminder", "system.alert",
  ];

  it.each(events)("%s renders in the shared layout with no 'undefined'", (event) => {
    const email = emailForEvent(event, { ...data, daysBefore: 2, title: "Trial ending", message: "Your trial ends soon." });
    expect(email).not.toBeNull();
    expect(email!.subject.length).toBeGreaterThan(5);
    expect(email!.html).toContain("/platterly-logo.png");
    expect(email!.html).not.toContain("cid:");
    expect(email!.html).not.toContain("undefined");
    expect(email!.html).not.toContain("Admin Panel");
  });

  it("copes with a bare payload", () => {
    for (const event of events) expect(emailForEvent(event, {})!.html).not.toContain("undefined");
  });

  it("uses the kitchen's name as the sign-off and its own wording when edited", () => {
    const email = emailForEvent("order.created", { ...data, customBody: "Hi {{customer_name}}, order {{order_number}} is confirmed." })!;
    expect(email.html).toContain("Spice Route");
    expect(email.html).toContain("Hi Asha, order ORD-1 is confirmed.");
  });

  it("leaves events without an email (in-app only) alone", () => {
    expect(emailForEvent("menu_approval.changes_requested", {})).toBeNull();
  });
});

describe("email additions (2026-10-04)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("password reset code email", () => {
    const { subject, html } = passwordResetEmail("482915", 10);
    expect(subject).toBe("Reset Your Platterly Password");
    expect(html).toContain("482915");
    expect(html).toContain("Valid for 10 minutes");
  });

  it("the logo is always a link, never an attachment, and EMAIL_LOGO_URL overrides the address", () => {
    vi.stubEnv("EMAIL_LOGO_URL", "");
    const html = verificationCodeEmail("111111", 10).html;
    expect(html).toContain("/platterly-logo.png");
    expect(html).not.toContain("cid:");
    vi.stubEnv("EMAIL_LOGO_URL", "https://catering.platterly.in/platterly-logo.png");
    expect(verificationCodeEmail("111111", 10).html).toContain('src="https://catering.platterly.in/platterly-logo.png"');
  });

  it("customer emails carry the unsubscribe link, team emails do not", () => {
    const customer = emailForEvent("event.reminder", { daysBefore: 1, unsubscribeUrl: "https://x.test/unsubscribe/abc.def" })!;
    expect(customer.html).toContain("https://x.test/unsubscribe/abc.def");
    expect(customer.html).toContain("promotional emails");
    expect(emailForEvent("order.new_alert", {})!.html).not.toContain("Unsubscribe");
  });

  it("a system alert email shows its title and message", () => {
    const { html } = emailForEvent("system.alert", { title: "Your plan changed", message: "Trial to Professional.", url: "https://x.test/settings/subscription" })!;
    expect(html).toContain("Your plan changed");
    expect(html).toContain("Trial to Professional.");
  });
});

describe("kitchen -> customer email list (2026-10-11)", () => {
  it("uses the agreed subjects", () => {
    expect(emailForEvent("order.status_changed", { status: "APPROVED" })?.subject).toBe("Your Catering Order is Confirmed");
    expect(emailForEvent("order.status_changed", { status: "COMPLETED" })?.subject).toBe("Your Catering Order Has Been Completed");
    expect(emailForEvent("order.status_changed", { status: "CANCELLED" })?.subject).toBe("Update on Your Catering Order Request");
    expect(emailForEvent("menu_approval.sent", {})?.subject).toBe("Review Your Catering Menu & Order");
    expect(emailForEvent("order.new_alert", {})?.subject).toBe("New Order Submitted for Review");
    expect(emailForEvent("lead.new", { customerName: "Asha" })?.subject).toBe("New Lead Added in Your Platterly Account");
    expect(emailForEvent("lead.incomplete_booking", { customerName: "Asha" })?.subject).toBe("New Incomplete Booking Lead");
  });

  it("food dispatched mentions the driver and the order, in the shared layout", () => {
    const mail = emailForEvent("logistics.dispatched_customer", { customerName: "Asha", orderNumber: "ORD-1", driverName: "Ravi", kitchenName: "Spice Kitchen" });
    expect(mail?.subject).toBe("Your Catering Order is On the Way");
    expect(mail?.html).toContain("Ravi");
    expect(mail?.html).toContain("ORD-1");
    expect(mail?.html).toContain("Spice Kitchen");
    // Same layout as the OTP email: the orange-to-green card and the footer are shared.
    const otp = verificationCodeEmail("123456", 10).html;
    expect(otp).toContain("linear-gradient");
    expect(mail?.html).toContain("linear-gradient");
  });

  it("each customer email maps to exactly one switch; team emails and account mails to none", () => {
    expect(emailMessageFor("order.created")).toBe("orderReceived");
    expect(emailMessageFor("quotation.converted")).toBe("orderAccepted");
    expect(emailMessageFor("order.status_changed", { status: "APPROVED" })).toBe("orderConfirmed");
    expect(emailMessageFor("order.status_changed", { status: "COMPLETED" })).toBe("orderCompleted");
    expect(emailMessageFor("order.status_changed", { status: "SENT_TO_KITCHEN" })).toBe("orderUpdate");
    expect(emailMessageFor("logistics.dispatched_customer")).toBe("foodDispatched");
    expect(emailMessageFor("payment.due")).toBe("paymentReminder");
    expect(emailMessageFor("payment.overdue")).toBe("paymentReminder");
    for (const event of ["order.new_alert", "payment.received", "payment.upi_claimed", "system.alert", "lead.new", "lead.incomplete_booking", "team.invitation_sent"]) expect(emailMessageFor(event)).toBeNull();
  });
});

describe("email footer and logo (2026-10-11)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("every email says Powered by Platterly in the footer", () => {
    expect(verificationCodeEmail("123456", 10).html).toContain("Powered by <a");
    expect(emailForEvent("logistics.dispatched_customer", {})?.html).toContain("Powered by <a");
  });

  it("the logo is never a cid attachment in any environment", () => {
    vi.stubEnv("EMAIL_LOGO_URL", "");
    for (const env of ["development", "production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(verificationCodeEmail("123456", 10).html).not.toContain("cid:");
    }
  });
});

describe("the email when an accepted quotation becomes an order (AJ, 2026-10-18)", () => {
  it("thanks the customer, gives the order number and says what happens next", () => {
    const mail = emailForEvent("quotation.converted", { kitchenName: "Spice Kitchen", customerName: "Asha", orderNumber: "ORD-0042", eventType: "Wedding", eventDate: "5 Dec 2026", amount: 120000 });
    expect(mail?.subject).toBe("Thank you for accepting our quotation — order ORD-0042");
    expect(mail?.html).toContain("Thank you for accepting our quotation");
    expect(mail?.html).toContain("ORD-0042");
    expect(mail?.html).toContain("We will email you all the details of your order shortly");
    expect(mail?.html).toContain("Once you review and approve them, we will start preparing for your event");
    expect(mail?.html).toContain("Spice Kitchen");
    expect(mail?.html).not.toContain("cid:");
    expect(mail?.html).not.toContain("undefined");
  });

  it("copes with no order number", () => {
    const mail = emailForEvent("quotation.converted", {});
    expect(mail?.subject).toBe("Thank you for accepting our quotation");
    expect(mail?.html).not.toContain("undefined");
  });
});

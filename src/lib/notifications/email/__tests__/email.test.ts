import { describe, it, expect, afterEach, vi } from "vitest";
import { verificationCodeEmail, teamInvitationEmail, emailForEvent, passwordResetEmail } from "../templates";
import { sendEmail } from "../zeptomail";
import { escapeHtml } from "../layout";

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
    "order.created", "order.new_alert", "order.status_changed", "quotation.sent", "menu_approval.sent", "invoice.sent", "receipt.sent",
    "payment.link_sent", "payment.received", "payment.upi_claimed", "payment.due", "payment.overdue", "event.reminder", "system.alert",
  ];

  it.each(events)("%s renders in the shared layout with no 'undefined'", (event) => {
    const email = emailForEvent(event, { ...data, daysBefore: 2, title: "Trial ending", message: "Your trial ends soon." });
    expect(email).not.toBeNull();
    expect(email!.subject.length).toBeGreaterThan(5);
    expect(email!.html).toContain("cid:platterly-logo");
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
    expect(subject).toBe("Platterly Password Reset");
    expect(html).toContain("482915");
    expect(html).toContain("Valid for 10 minutes");
  });

  it("the logo is an attachment by default and a plain link when EMAIL_LOGO_URL is set", () => {
    vi.stubEnv("EMAIL_LOGO_URL", "");
    expect(verificationCodeEmail("111111", 10).html).toContain("cid:platterly-logo");
    vi.stubEnv("EMAIL_LOGO_URL", "https://catering.platterly.in/platterly-logo.png");
    const html = verificationCodeEmail("111111", 10).html;
    expect(html).toContain('src="https://catering.platterly.in/platterly-logo.png"');
    expect(html).not.toContain("cid:platterly-logo");
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

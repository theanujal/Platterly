import { afterEach, describe, expect, it, vi } from "vitest";
import { MailDeliveryError, MailNotConfiguredError, otpEmail, sendAuthEmail } from "../mailer";

const ENV = { ZEPTOMAIL_API_URL: "http://localhost:3600/v1.1/email", ZEPTOMAIL_TOKEN: "tok", ZEPTOMAIL_FROM: "no-reply@auth.localhost" };
afterEach(() => vi.unstubAllGlobals());

describe("auth mailer (D5 is open: no production sender)", () => {
  it("throws when anything is missing, so a sign-up never pretends to have sent a code", async () => {
    for (const missing of Object.keys(ENV)) {
      const env = { ...ENV, [missing]: undefined };
      await expect(sendAuthEmail({ to: "a@b.test", subject: "s", text: "t" }, env)).rejects.toBeInstanceOf(MailNotConfiguredError);
    }
    await expect(sendAuthEmail({ to: "a@b.test", subject: "s", text: "t" }, {})).rejects.toBeInstanceOf(MailNotConfiguredError);
  });

  it("posts the ZeptoMail shape, escapes the text, and never puts the token in the body", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendAuthEmail({ to: "a@b.test", subject: "Sub", text: "<b>x</b> & y" }, ENV);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENV.ZEPTOMAIL_API_URL);
    expect((init.headers as Record<string, string>).authorization).toBe("Zoho-enczapikey tok");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: { address: "no-reply@auth.localhost" }, to: [{ email_address: { address: "a@b.test" } }], subject: "Sub" });
    expect(body.htmlbody).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(String(init.body)).not.toContain("tok");
  });

  it("fails loudly when the mail service refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 502 })));
    await expect(sendAuthEmail({ to: "a@b.test", subject: "s", text: "t" }, ENV)).rejects.toBeInstanceOf(MailDeliveryError);
  });

  it("sign-up and reset use Caterly's approved emails word for word, in the branded layout, with the code in the body and nowhere in the subject", () => {
    const verify = otpEmail("a@b.test", "123456", "email-verification");
    expect(verify.subject).toBe("Platterly Account Verification");
    expect(verify.html).toContain("Welcome to Platterly. Use the verification code below to complete your registration and activate your account.");
    expect(verify.html).toContain("Dear Caterer,");
    expect(verify.html).toContain("123456");
    const reset = otpEmail("a@b.test", "123456", "forget-password");
    expect(reset.subject).toBe("Reset Your Platterly Password");
    expect(reset.html).toContain("We received a request to reset the password for your Platterly account. Use the code below to choose a new one.");
    for (const kind of ["email-verification", "forget-password", "sign-in", "change-email"] as const) {
      const mail = otpEmail("a@b.test", "123456", kind);
      expect(mail.subject, kind).not.toContain("123456");
      expect(mail.html, kind).toContain("123456");
      expect(mail.html, kind).toContain("Platterly");
      expect(mail.text, kind).toContain("123456");
    }
  });

  it("the other code emails say what they are for", () => {
    expect(otpEmail("a@b.test", "123456", "change-email").subject).toBe("Confirm Your New Platterly Email");
    expect(otpEmail("a@b.test", "123456", "sign-in").subject).toBe("Your Platterly Sign-in Code");
  });

  it("an html email is sent as given; a plain one is escaped into paragraphs", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendAuthEmail({ to: "a@b.test", subject: "s", text: "t", html: "<h1>Hi</h1>" }, ENV);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).htmlbody).toBe("<h1>Hi</h1>");
  });

  it("mail guard: a real send to anyone but AJ is dropped quietly (nothing is fetched); AJ's address and the local sink still work", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const real = { ...ENV, ZEPTOMAIL_API_URL: "https://api.zeptomail.in/v1.1/email" };
    await sendAuthEmail({ to: "someone@example.com", subject: "Your Platterly code: 123456", text: "t" }, real);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn.mock.calls[0].join(" ")).not.toContain("someone@example.com");
    expect(warn.mock.calls[0].join(" ")).not.toContain("123456");
    await sendAuthEmail({ to: "npjalota@gmail.com", subject: "s", text: "t" }, real);
    await sendAuthEmail({ to: "someone@example.com", subject: "s", text: "t" }, ENV); // local sink
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

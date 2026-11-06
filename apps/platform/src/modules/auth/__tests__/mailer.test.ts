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

  it("each kind of code says what it is for and contains only the code as a secret", () => {
    expect(otpEmail("a@b.test", "123456", "email-verification").text).toContain("verify your Platterly email");
    expect(otpEmail("a@b.test", "123456", "forget-password").text).toContain("reset your Platterly password");
    expect(otpEmail("a@b.test", "123456", "sign-in").text).toContain("sign in");
    expect(otpEmail("a@b.test", "123456", "change-email").text).toContain("new Platterly email");
    expect(otpEmail("a@b.test", "123456", "sign-in").subject).toContain("123456");
  });
});

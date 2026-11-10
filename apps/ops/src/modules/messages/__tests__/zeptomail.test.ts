import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../zeptomail";

afterEach(() => vi.unstubAllEnvs());

describe("sendEmail (ZeptoMail)", () => {
  it("logs ZeptoMail's own reason from its error object", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    vi.stubEnv("ZEPTOMAIL_API_URL", "http://127.0.0.1:3600/v1.1/email");
    const body = { error: { code: "TM_5001", details: [{ code: "LE_102", message: "Credit exhausted" }], message: "Resource Limit Exhausted." } };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 429 })) as unknown as typeof fetch;
    const result = await sendEmail({ to: "a@b.test", subject: "s", html: "x" }, fetchImpl);
    expect(result).toEqual({ status: "failed", reason: "ZeptoMail 429: Resource Limit Exhausted. (LE_102: Credit exhausted)" });
  });

  it("mail guard: a real send to anyone but AJ is skipped and nothing is fetched; AJ's address still works", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    vi.stubEnv("ZEPTOMAIL_API_URL", "https://api.zeptomail.in/v1.1/email");
    vi.stubEnv("MAIL_GUARD", "");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ request_id: "r" }), { status: 200 })) as unknown as typeof fetch;
    expect(await sendEmail({ to: "customer@example.com", subject: "s", html: "x" }, fetchImpl)).toMatchObject({ status: "skipped" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await sendEmail({ to: "npjalota@gmail.com", subject: "s", html: "x" }, fetchImpl)).status).toBe("sent");
  });
});

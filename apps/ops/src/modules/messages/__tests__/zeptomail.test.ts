import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../zeptomail";

afterEach(() => vi.unstubAllEnvs());

describe("sendEmail (ZeptoMail)", () => {
  it("logs ZeptoMail's own reason from its error object", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "abc");
    vi.stubEnv("ZEPTOMAIL_FROM", "noreply@platterly.test");
    const body = { error: { code: "TM_5001", details: [{ code: "LE_102", message: "Credit exhausted" }], message: "Resource Limit Exhausted." } };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 429 })) as unknown as typeof fetch;
    const result = await sendEmail({ to: "a@b.test", subject: "s", html: "x" }, fetchImpl);
    expect(result).toEqual({ status: "failed", reason: "ZeptoMail 429: Resource Limit Exhausted. (LE_102: Credit exhausted)" });
  });
});

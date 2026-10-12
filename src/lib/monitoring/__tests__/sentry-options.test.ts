import { describe, expect, it } from "vitest";
import { scrubEvent, scrubText, sentryOptions } from "../sentry-options";

describe("error monitoring options (AJ, 2026-10-12)", () => {
  it("is off without a DSN, so dev, CI and tests send nothing, and on with one", () => {
    expect(sentryOptions(undefined, { app: "catering" })).toMatchObject({ enabled: false, dsn: undefined, sendDefaultPii: false });
    expect(sentryOptions("", { app: "catering" }).enabled).toBe(false);
    const on = sentryOptions("https://key@o1.ingest.sentry.io/1", { app: "ops", environment: "production", release: "abc123" });
    expect(on).toMatchObject({ enabled: true, environment: "production", release: "abc123", sendDefaultPii: false, initialScope: { tags: { app: "ops" } } });
  });

  it("removes cookies, bodies, query strings, the person and identifying headers before an event leaves", () => {
    const event = scrubEvent({
      type: undefined,
      user: { email: "asha@example.test", ip_address: "1.2.3.4" },
      request: { url: "https://catering.platterly.in/orders", cookies: { session: "secret" }, data: { phone: "9876543210" }, query_string: "token=abc", headers: { Cookie: "a=b", Authorization: "Bearer x", "X-Forwarded-For": "1.2.3.4", Accept: "text/html" } },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://catering.platterly.in/orders", headers: { Accept: "text/html" } });
  });

  it("scrubs e-mail addresses and phone numbers from messages and exception text", () => {
    expect(scrubText("Could not email asha@example.test or call +91 98765 43210")).toBe("Could not email [email] or call [phone]");
    const event = scrubEvent({ type: undefined, message: "Failed for asha@example.test", exception: { values: [{ value: "bad number 9876543210" }] } });
    expect(event.message).toBe("Failed for [email]");
    expect(event.exception?.values?.[0].value).toBe("bad number [phone]");
  });
});

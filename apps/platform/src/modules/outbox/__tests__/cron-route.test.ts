import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../../../app/api/cron/outbox/route";

const call = (authorization?: string) => POST(new Request("http://localhost/api/cron/outbox", { method: "POST", headers: authorization ? { authorization } : {} }));
const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("cron route for the outbox worker", () => {
  it("is closed when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything-at-all-16chars")).status).toBe(401);
  });
  it("refuses a missing or wrong secret, and a short configured secret", async () => {
    process.env.CRON_SECRET = "a-long-enough-secret";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-value!")).status).toBe(401);
    process.env.CRON_SECRET = "short";
    expect((await call("Bearer short")).status).toBe(401);
  });
  it("with the right secret but no sender (real delivery is IC1), answers 503 and runs nothing", async () => {
    process.env.CRON_SECRET = "a-long-enough-secret";
    const res = await call("Bearer a-long-enough-secret");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "delivery_not_configured" });
  });
});

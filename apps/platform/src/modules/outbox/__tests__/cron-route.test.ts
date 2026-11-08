import { afterEach, describe, expect, it, vi } from "vitest";

// The worker and sender are replaced: this test must never claim or send a real queued event.
const runBatch = vi.fn(async () => ({ claimed: 2, delivered: 1, retried: 1, dead: 0, lostLease: 0 }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/modules/outbox/deliver", () => ({ runDeliveryBatch: () => runBatch() }));
vi.mock("@/modules/outbox/sender", () => ({ getSender: () => async () => ({ ok: true }) }));

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
  it("with the right secret it runs the worker and reports its counts", async () => {
    process.env.CRON_SECRET = "a-long-enough-secret";
    const res = await call("Bearer a-long-enough-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 2, delivered: 1, retried: 1, dead: 0, lostLease: 0 });
    expect(runBatch).toHaveBeenCalledTimes(1);
  });
  it("does not run the worker for a refused request", async () => {
    runBatch.mockClear();
    process.env.CRON_SECRET = "a-long-enough-secret";
    await call("Bearer wrong-secret-value!");
    expect(runBatch).not.toHaveBeenCalled();
  });
});

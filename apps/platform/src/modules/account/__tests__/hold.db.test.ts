import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { mayStartSession, notifyOps, openHold, resendUnnotified } from "../hold";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

// The account hold (identity test database): a held person may not start a session until Ops says staff cleared the review; Ops being unreachable keeps the hold.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const env = { OPS_BASE_URL: "http://ops.localhost:3200", OPS_PLATFORM_BILLING_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;

/** An Ops that answers every call with `body`, signed with the id of the request it got. */
const ops = (body: unknown, status = 200) =>
  vi.fn(async (_url: URL, init: RequestInit) => {
    const id = new Headers(init.headers).get("x-platterly-event-id")!;
    const text = JSON.stringify(body);
    return new Response(text, { status, headers: signedHeaders(SECRET, id, text) });
  });

describe.skipIf(!testUrl)("account hold", () => {
  let h: Harness;
  beforeAll(async () => { h = await openHarness(); }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "accountHold"; delete from "emailChange"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
    await h.pool.query(`insert into "emailChange" ("id", "userId", "oldEmail", "newEmail", "status", "cancelReason", "cancelNote") values ('chg1', 'u1', 'u1@x.test', 'n@y.test', 'cancelled', 'not_me', 'no')`);
    await h.pool.query(`insert into "accountHold" ("userId", "reviewId", "reason") values ('u1', 'chg1', 'not_me')`);
  });

  it("a person with no hold may start a session, with no call to Ops", async () => {
    const f = ops({});
    expect(await mayStartSession(h.pool as never, "u2", { env, fetchImpl: f as never })).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("a held person stays out while the review is open, and Ops being down, unsigned, or unconfigured keeps them out", async () => {
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: ops({ reviewId: "chg1", status: "OPEN" }) as never })).toBe(false);
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: (async () => { throw new Error("down"); }) as never })).toBe(false);
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: (async () => new Response(JSON.stringify({ status: "CLEARED" }))) as never })).toBe(false); // not signed
    expect(await mayStartSession(h.pool as never, "u1", { env: {} as never, fetchImpl: ops({ status: "CLEARED" }) as never })).toBe(false);
    expect(await openHold(h.pool, "u1")).not.toBeNull();
  });

  it("once Ops says the review is cleared the hold is lifted for good", async () => {
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: ops({ reviewId: "chg1", status: "CLEARED" }) as never })).toBe(true);
    expect(await openHold(h.pool, "u1")).toBeNull();
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: (async () => { throw new Error("down"); }) as never })).toBe(true); // no more calls needed
  });

  it("tells Ops about the review once, signed, and remembers it; a held person Ops has not heard of gets reported at their next sign-in attempt", async () => {
    const f = ops({ reviewId: "chg1", created: true });
    expect(await notifyOps(h.pool, { userId: "u1", reviewId: "chg1", oldEmail: "u1@x.test", newEmail: "n@y.test", reason: "not_me", note: "no", requestedAt: new Date() }, { env, fetchImpl: f as never })).toBe(true);
    const sent = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toMatchObject({ reviewId: "chg1", subject: "u1", oldEmail: "u1@x.test", newEmail: "n@y.test", reason: "not_me" });
    expect((await h.pool.query('select "opsNotifiedAt" from "accountHold" where "userId" = $1', ["u1"])).rows[0].opsNotifiedAt).not.toBeNull();
    await h.pool.query(`update "accountHold" set "opsNotifiedAt" = null`);
    const g = vi.fn(async (url: URL, init: RequestInit) => {
      const id = new Headers(init.headers).get("x-platterly-event-id") ?? newId("command");
      const unknown = url.pathname.endsWith("/status");
      const text = JSON.stringify(unknown ? { error: "unknown_review" } : { reviewId: "chg1", created: true });
      return new Response(text, { status: unknown ? 404 : 200, headers: signedHeaders(SECRET, id, text) });
    });
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: g as never })).toBe(false);
    expect((await h.pool.query('select "opsNotifiedAt" from "accountHold" where "userId" = $1', ["u1"])).rows[0].opsNotifiedAt).not.toBeNull();
    expect(await resendUnnotified(h.pool, { env, fetchImpl: g as never })).toBe(0); // nothing left to resend
  });
});

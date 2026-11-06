import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Harness, openHarness, testUrl } from "../../auth/__tests__/helpers";
import { deviceLabel, listDevices, revokeAllDevices, revokeDevice } from "../devices";

// F4.3.1 against the real identity test database: a person sees, and can end, only their own sessions.
const id = () => randomBytes(12).toString("hex");
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("device labels", () => {
  it("name the browser and the kind of device, and nothing else", () => {
    expect(deviceLabel(CHROME_MAC)).toBe("Chrome on a Mac");
    expect(deviceLabel(SAFARI_IPHONE)).toBe("Safari on an iPhone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0")).toBe("Firefox on Linux");
    expect(deviceLabel(null)).toBe("A browser");
    expect(deviceLabel("curl/8.0")).toBe("A browser");
    expect(deviceLabel(`${CHROME_MAC} 203.0.113.9`)).not.toContain("203.0.113.9");
  });
});

describe.skipIf(!testUrl)("own sessions only, against the real identity database", () => {
  let h: Harness;
  let pool: Pool;
  beforeAll(async () => {
    h = await openHarness();
    pool = h.pool;
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query('delete from "session"');
    await pool.query('delete from "user"');
  });

  const user = async (email = `${id()}@devices.test`) => {
    const userId = id();
    await pool.query(`insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") values ($1, 'T', $2, true, now(), now())`, [userId, email]);
    return userId;
  };
  const session = async (userId: string, o: { ua?: string; expiresIn?: string; createdAgo?: string; updatedAgo?: string } = {}) => {
    const sid = id();
    await pool.query(
      `insert into "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "userAgent", "userId") values ($1, now() + $2::interval, $3, now() - $4::interval, now() - $5::interval, $6, $7)`,
      [sid, o.expiresIn ?? "7 days", id(), o.createdAgo ?? "1 minute", o.updatedAgo ?? "1 minute", o.ua ?? CHROME_MAC, userId],
    );
    return sid;
  };
  const alive = async (sid: string) => (await pool.query('select 1 from "session" where id = $1', [sid])).rowCount === 1;

  it("lists only the caller's own live sessions, marks the current one, newest activity first, with a label and no IP address", async () => {
    const [me, other] = [await user(), await user()];
    const older = await session(me, { updatedAgo: "2 hours", ua: SAFARI_IPHONE });
    const current = await session(me, { updatedAgo: "1 minute" });
    await session(other);
    const list = await listDevices(pool, me, current);
    expect(list.map((d) => d.id)).toEqual([current, older]);
    expect(list.map((d) => [d.label, d.current])).toEqual([["Chrome on a Mac", true], ["Safari on an iPhone", false]]);
    expect(Object.keys(list[0]).sort()).toEqual(["current", "id", "label", "lastActive"]);
  });

  it("does not list a session that has expired (idle or absolute)", async () => {
    const me = await user();
    const live = await session(me);
    await session(me, { expiresIn: "-1 minute" });
    await session(me, { createdAgo: "31 days" });
    expect((await listDevices(pool, me, live)).map((d) => d.id)).toEqual([live]);
  });

  it("revoking one of my own sessions ends it and no other", async () => {
    const me = await user();
    const [keep, drop] = [await session(me), await session(me)];
    expect(await revokeDevice(pool, me, keep, drop)).toEqual({ ok: true, ended: 1, signedOut: false });
    expect(await alive(drop)).toBe(false);
    expect(await alive(keep)).toBe(true);
  });

  it("revoking the session I am using says so (the caller then clears the cookie)", async () => {
    const me = await user();
    const current = await session(me);
    expect(await revokeDevice(pool, me, current, current)).toEqual({ ok: true, ended: 1, signedOut: true });
    expect(await alive(current)).toBe(false);
  });

  it("another person's session, and an unknown one, are both 'not found' and stay alive", async () => {
    const [me, other] = [await user(), await user()];
    const mine = await session(me);
    const theirs = await session(other);
    expect(await revokeDevice(pool, me, mine, theirs)).toEqual({ ok: false, reason: "not_found" });
    expect(await revokeDevice(pool, me, mine, "no-such-session")).toEqual({ ok: false, reason: "not_found" });
    expect(await alive(theirs)).toBe(true);
  });

  it("sign out everywhere ends all of mine and none of anyone else's", async () => {
    const [me, other] = [await user(), await user()];
    const mine = [await session(me), await session(me), await session(me)];
    const theirs = await session(other);
    expect(await revokeAllDevices(pool, me)).toEqual({ ok: true, ended: 3, signedOut: true });
    for (const sid of mine) expect(await alive(sid)).toBe(false);
    expect(await alive(theirs)).toBe(true);
    expect(await listDevices(pool, me, mine[0])).toEqual([]);
  });
});

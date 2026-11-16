import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signedHeaders } from "@platterly/contract";
import { requestDeletion } from "../data-rights";
import { isDeletionApproved, reportErasures, sendRequestToOps, sendWithdrawalToOps, syncDeletionRequests } from "../deletion-ops";
import { mayStartSession } from "../hold";
import { cancelDeletion } from "../data-rights";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

// Account deletion requests, Platform side (identity test database): Ops is told, its decision is pulled, and an approval blocks sign-in until staff restore it.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const env = { OPS_BASE_URL: "http://ops.localhost:3200", OPS_PLATFORM_BILLING_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const details = { subject: "u1", name: "U One", email: "u1@x.test", phone: "+919800000123", businessId: "biz_1", businessName: "Test Kitchen", products: ["caterly"] };

/** An Ops that answers every call with what `answer(path, body)` says, signed with the id of the request it got. */
const ops = (answer: (path: string, body: Record<string, unknown>) => unknown) =>
  vi.fn(async (url: URL, init: RequestInit) => {
    const id = new Headers(init.headers).get("x-platterly-event-id")!;
    const text = JSON.stringify(answer(new URL(url).pathname, JSON.parse(String(init.body))));
    return new Response(text, { status: 200, headers: signedHeaders(SECRET, id, text) });
  });

describe.skipIf(!testUrl)("account deletion requests and Ops", () => {
  let h: Harness;
  const mails: { to: string; subject: string }[] = [];
  const sendEmail = (async (m: { to: string; subject: string }) => { mails.push({ to: m.to, subject: m.subject }); }) as never;
  beforeAll(async () => { h = await openHarness(); }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    mails.length = 0;
    await h.pool.query('delete from "deletionRequest"; delete from "accountHold"; delete from "emailChange"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true)`);
  });

  async function opened() {
    const made = await requestDeletion(h.pool, "u1", { details, reason: "closing" });
    if (!made.ok) throw new Error("not opened");
    return made.payload.requestId;
  }

  it("tells Ops about a new request once, signed with its details, and remembers it; if Ops is down the next pass tells it again", async () => {
    const id = await opened();
    expect(await sendRequestToOps(h.pool, id, { env, fetchImpl: (async () => { throw new Error("down"); }) as never })).toBe(false);
    const f = ops(() => ({ requestId: id, created: true }));
    expect(await syncDeletionRequests(h.pool, { env, fetchImpl: f as never, sendEmail })).toMatchObject({ sent: 1 });
    const body = JSON.parse(String((f.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ requestId: id, subject: "u1", email: "u1@x.test", businessId: "biz_1", products: ["caterly"], reason: "closing" });
    expect((await h.pool.query('select "opsNotifiedAt" from "deletionRequest" where id = $1', [id])).rows[0].opsNotifiedAt).not.toBeNull();
    const again = ops(() => ({}));
    await syncDeletionRequests(h.pool, { env, fetchImpl: again as never, sendEmail });
    expect(again.mock.calls.every(([u]) => !String(u).endsWith("/api/platform/account-deletions"))).toBe(true);
  });

  it("an approval ends every session, blocks sign-in, and emails the person once; a restore releases it", async () => {
    const id = await opened();
    await h.pool.query('update "deletionRequest" set "opsNotifiedAt" = now() where id = $1', [id]);
    await h.pool.query(`insert into session (id, "userId", token, "expiresAt", "createdAt", "updatedAt") values ('s1', 'u1', 'tok', now() + interval '1 day', now(), now())`);
    const approved = ops(() => ({ requestId: id, status: "APPROVED", declineReason: null, eraseAfter: "2026-12-20T00:00:00.000Z" }));
    expect(await syncDeletionRequests(h.pool, { env, fetchImpl: approved as never, sendEmail })).toMatchObject({ decided: 1 });
    expect(await syncDeletionRequests(h.pool, { env, fetchImpl: approved as never, sendEmail })).toMatchObject({ decided: 0 });
    expect(mails).toEqual([{ to: "u1@x.test", subject: "Your Platterly account deletion was approved" }]);
    expect((await h.pool.query("select count(*) from session where \"userId\" = 'u1'")).rows[0].count).toBe("0");
    expect(await isDeletionApproved(h.pool, "u1")).toBe(true);
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: approved as never })).toBe(false);

    const restored = ops(() => ({ requestId: id, status: "RESTORED", declineReason: null, eraseAfter: null }));
    expect(await syncDeletionRequests(h.pool, { env, fetchImpl: restored as never, sendEmail })).toMatchObject({ decided: 1 });
    expect(mails.map((m) => m.subject)).toContain("Your Platterly account was restored");
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: restored as never })).toBe(true);
  });

  it("a decline closes the request with the reason and emails the person", async () => {
    const id = await opened();
    await h.pool.query('update "deletionRequest" set "opsNotifiedAt" = now() where id = $1', [id]);
    const declined = ops(() => ({ requestId: id, status: "DECLINED", declineReason: "Open invoice first.", eraseAfter: null }));
    expect(await syncDeletionRequests(h.pool, { env, fetchImpl: declined as never, sendEmail })).toMatchObject({ decided: 1 });
    expect((await h.pool.query('select status, "declineReason" from "deletionRequest" where id = $1', [id])).rows[0]).toEqual({ status: "declined", declineReason: "Open invoice first." });
    expect(mails).toEqual([{ to: "u1@x.test", subject: "Your Platterly account deletion request was declined" }]);
    expect(await mayStartSession(h.pool as never, "u1", { env, fetchImpl: declined as never })).toBe(true);
  });

  it("a withdrawal is passed to Ops, and is retried by the next pass if Ops was down", async () => {
    const id = await opened();
    await h.pool.query('update "deletionRequest" set "opsNotifiedAt" = now() where id = $1', [id]);
    expect(await cancelDeletion(h.pool, "u1")).toBe(id);
    expect(await sendWithdrawalToOps(h.pool, id, { env, fetchImpl: (async () => { throw new Error("down"); }) as never })).toBe(false);
    const f = ops(() => ({ requestId: id, status: "WITHDRAWN" }));
    await syncDeletionRequests(h.pool, { env, fetchImpl: f as never, sendEmail });
    expect(f.mock.calls.map(([u]) => new URL(String(u)).pathname)).toContain("/api/platform/account-deletions/withdraw");
    expect((await h.pool.query('select "withdrawNotifiedAt" from "deletionRequest" where id = $1', [id])).rows[0].withdrawNotifiedAt).not.toBeNull();
  });

  it("Erase now: the person and their rows go, the files go, and Ops is told once, even if it was down at first", async () => {
    const id = await opened();
    await h.pool.query('update "deletionRequest" set "opsNotifiedAt" = now(), "status" = \'approved\' where id = $1', [id]);
    await h.pool.query(`insert into "accountProfile" ("userId", "photoKey", "photoType", "photoUpdatedAt") values ('u1', 'photo-u1.png', 'image/png', now())`);
    await h.pool.query(`insert into session (id, "userId", token, "expiresAt", "createdAt", "updatedAt") values ('s1', 'u1', 'tok', now() + interval '1 day', now(), now())`);
    await h.pool.query(`insert into "verification" (id, identifier, value, "expiresAt") values ('v1', 'sign-in-otp-u1@x.test', '123456', now() + interval '1 day')`);
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u2', 'Other', 'u2@x.test', true)`);
    const photos = await mkdtemp(path.join(os.tmpdir(), "erase-photos-"));
    const logos = await mkdtemp(path.join(os.tmpdir(), "erase-logos-"));
    await writeFile(path.join(photos, "photo-u1.png"), "x");
    const logoKey = `${"a".repeat(32)}.png`;
    await writeFile(path.join(logos, logoKey), "x");
    await writeFile(path.join(logos, `${"b".repeat(32)}.png`), "x");
    // An upload by u1 that was never saved to a profile (not in Ops's list) goes too; u2's upload stays.
    await writeFile(path.join(logos, `${"c".repeat(32)}.png`), "x");
    await h.pool.query(`insert into "accountLogoUpload" ("key", "userId") values ($1, 'u1')`, [`${"c".repeat(32)}.png`]);
    const erased: [string, string | null][] = [];
    const eraser = async (subject: string, businessId: string | null) => { erased.push([subject, businessId]); };
    const { eraseAccount } = await import("../erase");
    expect(await eraseAccount(h.pool, { requestId: id, userId: "u1", businessId: "biz_1", logoUrls: [`http://account.localhost:3300/api/business-logo/${logoKey}`] }, eraser, { photos, logos })).toBe(true);
    expect(erased).toEqual([["u1", "biz_1"]]);
    expect((await h.pool.query(`select count(*) from "user" where id = 'u1'`)).rows[0].count).toBe("0");
    for (const table of ["session", "accountProfile", "deletionRequest"]) expect((await h.pool.query(`select count(*) from "${table}" where "userId" = 'u1'`)).rows[0].count, table).toBe("0");
    expect((await h.pool.query(`select count(*) from "verification" where id = 'v1'`)).rows[0].count).toBe("0");
    expect((await h.pool.query(`select count(*) from "user" where id = 'u2'`)).rows[0].count).toBe("1");
    expect(await readdir(photos)).toEqual([]);
    expect(await readdir(logos)).toEqual([`${"b".repeat(32)}.png`]);
    // Nobody left to erase: a second run does nothing.
    expect(await eraseAccount(h.pool, { requestId: id, userId: "u1", businessId: "biz_1", logoUrls: [] }, eraser, { photos, logos })).toBe(false);

    // Ops is told; if it is down the receipt waits for the next pass.
    expect((await h.pool.query('select "reportedAt" from "erasureReceipt" where "requestId" = $1', [id])).rows[0].reportedAt).toBeNull();
    expect(await reportErasures(h.pool, { env, fetchImpl: (async () => { throw new Error("down"); }) as never })).toBe(0);
    const told = ops(() => ({ requestId: id, status: "ERASED" }));
    expect(await reportErasures(h.pool, { env, fetchImpl: told as never })).toBe(1);
    expect(told.mock.calls.map(([u]) => new URL(String(u)).pathname)).toEqual(["/api/platform/account-deletions/erased"]);
    expect(await reportErasures(h.pool, { env, fetchImpl: told as never })).toBe(0);
  });

  it("the sync pass erases when Ops says staff pressed Erase now, with the logo links Ops kept", async () => {
    const id = await opened();
    await h.pool.query('update "deletionRequest" set "opsNotifiedAt" = now(), "status" = \'approved\' where id = $1', [id]);
    const erased: [string, string | null][] = [];
    const f = ops((path) => (path.endsWith("/erased") ? { requestId: id, status: "ERASED" } : { requestId: id, status: "APPROVED", declineReason: null, eraseAfter: null, eraseRequested: true, logoUrls: [] }));
    const result = await syncDeletionRequests(h.pool, { env, fetchImpl: f as never, sendEmail, eraser: async (s, b) => { erased.push([s, b]); } });
    expect(result).toMatchObject({ erased: 1 });
    expect(erased).toEqual([["u1", "biz_1"]]);
    expect((await h.pool.query(`select count(*) from "user" where id = 'u1'`)).rows[0].count).toBe("0");
    expect((await h.pool.query('select "reportedAt" from "erasureReceipt" where "requestId" = $1', [id])).rows[0].reportedAt).not.toBeNull();
  });
});

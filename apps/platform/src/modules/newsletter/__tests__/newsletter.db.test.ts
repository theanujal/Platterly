import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";
import type { AuthEmail } from "../../auth/mailer";

// Ops is faked at the one function that talks to it, so what the Platform asks and reports can be read back.
const ops = vi.hoisted(() => ({ calls: [] as { path: string; body: unknown }[], answer: { ok: true, value: {} } as { ok: boolean; value?: unknown; reason?: string } }));
vi.mock("../../account/hold", () => ({
  opsPost: async (path: string, body: unknown) => {
    ops.calls.push({ path, body });
    return path.endsWith("/next") ? ops.answer : { ok: true, value: { ok: true } };
  },
}));

import { runNewsletter } from "../send";
import { applyUnsubscribe, unsubscribeToken, unsubscribeUrl, verifyUnsubscribe } from "../unsubscribe";
import { alertThirdPartyAccess } from "../../account/third-party-alert";
import { setPreferences } from "../../account/notification-preferences";

const SECRET = "newsletter-test-secret-0123456789abcdef";
const ISSUE = { issueId: "issue-1", subject: "May news", body: "# Hello\n\nA **new** month.\n\n[Read more](https://platterly.in/blog)" };

describe.skipIf(!testUrl)("newsletter sending (identity test database)", () => {
  let h: Harness;
  const sent: AuthEmail[] = [];
  const send = async (m: AuthEmail) => void sent.push(m);
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    sent.length = 0;
    ops.calls.length = 0;
    ops.answer = { ok: true, value: { issue: ISSUE, tests: [] } };
    await h.pool.query('delete from "newsletterDelivery"; delete from "accountHold"; delete from "accountProfile"; delete from "notificationPreference"; delete from session; delete from account; delete from "user"');
  });
  const person = async (id: string, opts: { subscribed?: boolean; verified?: boolean } = {}) => {
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $2, $3)`, [id, `${id}@x.test`, opts.verified ?? true]);
    if (opts.subscribed !== false) await h.pool.query(`insert into "accountProfile" ("userId", "notifyProductUpdates") values ($1, true)`, [id]);
  };
  const run = (extra: Record<string, unknown> = {}) => runNewsletter(h.pool, { send, secret: SECRET, env: { AUTH_SECRET: SECRET } as unknown as NodeJS.ProcessEnv, ...extra });
  const resultCalls = () => ops.calls.filter((c) => c.path.endsWith("/result")).map((c) => c.body);

  it("mails only people who have the newsletter on, a verified email and no open hold, once each, and reports done", async () => {
    await person("a");
    await person("b");
    await person("off", { subscribed: false });
    await person("unverified", { verified: false });
    await person("held");
    await h.pool.query(`insert into "accountHold" ("userId", "reviewId", "reason") values ('held', 'r1', 'x')`);
    const first = await run();
    expect(first).toMatchObject({ status: "ok", sent: 2, failed: 0, done: true, issueId: "issue-1" });
    expect(sent.map((m) => m.to).sort()).toEqual(["a@x.test", "b@x.test"]);
    expect(resultCalls()).toEqual([{ issueId: "issue-1", kind: "send", sent: 2, failed: 0, done: true }]);
    // The same run again mails nobody.
    sent.length = 0;
    expect(await run()).toMatchObject({ sent: 0, done: true });
    expect(sent).toEqual([]);
  });

  it("sends in batches and never twice", async () => {
    for (const id of ["p1", "p2", "p3"]) await person(id);
    expect(await run({ batch: 2 })).toMatchObject({ sent: 2, done: false });
    expect(await run({ batch: 2 })).toMatchObject({ sent: 1, done: true });
    expect(sent.map((m) => m.to).sort()).toEqual(["p1@x.test", "p2@x.test", "p3@x.test"]);
  });

  it("puts the issue in the approved layout with a personal unsubscribe link, and a plain-text version", async () => {
    await person("a");
    await run();
    const mail = sent[0];
    expect(mail.subject).toBe("May news");
    expect(mail.html).toContain("<h2");
    expect(mail.html).toContain("display:inline-block");
    expect(mail.html).toContain("Unsubscribe");
    const url = /href="([^"]*\/unsubscribe\?[^"]*)"/.exec(mail.html ?? "")?.[1]?.replace(/&amp;/g, "&");
    expect(url).toBeTruthy();
    const params = new URL(url as string).searchParams;
    expect(params.get("u")).toBe("a");
    expect(verifyUnsubscribe(SECRET, params.get("u") as string, params.get("t") as string)).toBe(true);
    expect(mail.text).toContain("Unsubscribe: ");
  });

  it("counts a failed send and does not retry that person for the same issue", async () => {
    await person("a");
    await person("b");
    const failing = async (m: AuthEmail) => { if (m.to === "a@x.test") throw new Error("boom"); sent.push(m); };
    expect(await run({ send: failing })).toMatchObject({ sent: 1, failed: 1, done: true });
    sent.length = 0;
    expect(await run()).toMatchObject({ sent: 0 });
    expect((await h.pool.query(`select status from "newsletterDelivery" where "userId" = 'a'`)).rows[0].status).toBe("failed");
  });

  it("sends a test to the staff address and tells Ops, without touching the subscribers", async () => {
    await person("a");
    ops.answer = { ok: true, value: { issue: null, tests: [{ ...ISSUE, to: "staff@platterly.in" }] } };
    const out = await run();
    expect(out).toMatchObject({ tests: 1, sent: 0, issueId: null });
    expect(sent.map((m) => m.to)).toEqual(["staff@platterly.in"]);
    expect(resultCalls()).toEqual([{ issueId: "issue-1", kind: "test", sent: 1, failed: 0, done: true }]);
    expect((await h.pool.query(`select count(*)::int n from "newsletterDelivery"`)).rows[0].n).toBe(0);
  });

  it("does nothing when Ops has nothing due or cannot be reached", async () => {
    await person("a");
    ops.answer = { ok: true, value: { issue: null, tests: [] } };
    expect(await run()).toMatchObject({ status: "ok", sent: 0, issueId: null });
    ops.answer = { ok: false, reason: "unreachable" };
    expect(await run()).toMatchObject({ status: "unreachable", sent: 0 });
    expect(sent).toEqual([]);
  });

  it("an unsubscribed person gets nothing from the next issue", async () => {
    await person("a");
    await person("b");
    expect(await applyUnsubscribe(h.pool, "a")).toBe(true);
    expect(await applyUnsubscribe(h.pool, "nobody")).toBe(false);
    await run();
    expect(sent.map((m) => m.to)).toEqual(["b@x.test"]);
  });
});

describe("unsubscribe links", () => {
  it("only the right person and signature pass", () => {
    const t = unsubscribeToken(SECRET, "u1");
    expect(verifyUnsubscribe(SECRET, "u1", t)).toBe(true);
    expect(verifyUnsubscribe(SECRET, "u2", t)).toBe(false);
    expect(verifyUnsubscribe(SECRET, "u1", `${t}x`)).toBe(false);
    expect(verifyUnsubscribe("other-secret-0123456789abcdef0123", "u1", t)).toBe(false);
    expect(verifyUnsubscribe("", "u1", t)).toBe(false);
    expect(unsubscribeUrl("http://account.localhost:3300", SECRET, "u1")).toBe(`http://account.localhost:3300/unsubscribe?u=u1&t=${t}`);
  });
});

describe.skipIf(!testUrl)("app access alert (identity test database)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "notificationPreference"; delete from "accountProfile"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U', 'u1@x.test', true)`);
  });
  it("mails the person by default, names the app, and stays quiet when the switch is off", async () => {
    const sent: AuthEmail[] = [];
    const send = async (m: AuthEmail) => void sent.push(m);
    expect(await alertThirdPartyAccess(h.pool, "u1", "Acme Reports <b>", send)).toBe(true);
    expect(sent[0].to).toBe("u1@x.test");
    expect(sent[0].subject).toBe("An app was given access to your Platterly account");
    expect(sent[0].html).toContain("Acme Reports");
    expect(sent[0].html).not.toContain("<b>");
    await setPreferences(h.pool, "u1", { thirdPartyAlert: false });
    expect(await alertThirdPartyAccess(h.pool, "u1", "Acme Reports", send)).toBe(false);
    expect(sent.length).toBe(1);
    expect(await alertThirdPartyAccess(h.pool, "nobody", "Acme", send)).toBe(false);
  });
});

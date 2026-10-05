import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, attemptMessage, runDueMessages, sendMessage } from "../messages";
import { TEMPLATES, renderTemplate } from "../templates";

const KEY = "msgtest";
const BIZ = `biz_${"9".repeat(32)}`;
const NO_EMAIL = `biz_${"8".repeat(32)}`;
const saved = { token: process.env.ZEPTOMAIL_TOKEN, from: process.env.ZEPTOMAIL_FROM };
const ctx = { businessName: "Asha's <Kitchen>", ownerName: "Asha", productName: "Catering", productUrl: "https://catering.example" };

let calls: { url: string; body: { to: { email_address: { address: string } }[]; subject: string; htmlbody: string } }[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: { request_id: "req-1" } };
const fakeFetch = (async (url: string, init: { body: string }) => {
  calls.push({ url, body: JSON.parse(init.body) });
  return new Response(JSON.stringify(answer.body), { status: answer.status });
}) as unknown as typeof fetch;

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { id: { in: [BIZ, NO_EMAIL] } } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

beforeAll(clean);
afterAll(async () => {
  await clean();
  process.env.ZEPTOMAIL_TOKEN = saved.token;
  process.env.ZEPTOMAIL_FROM = saved.from;
  if (saved.token === undefined) delete process.env.ZEPTOMAIL_TOKEN;
  if (saved.from === undefined) delete process.env.ZEPTOMAIL_FROM;
});
beforeEach(async () => {
  await clean();
  calls = [];
  answer = { status: 200, body: { request_id: "req-1" } };
  process.env.ZEPTOMAIL_TOKEN = "test-token";
  process.env.ZEPTOMAIL_FROM = "noreply@example.test";
  await prisma.product.create({ data: { key: KEY, name: "Catering", baseUrl: "https://catering.example", outboundSecret: "x", inboundSecret: "x" } });
  await prisma.business.create({ data: { id: BIZ, name: "Asha's Kitchen", ownerName: "Asha", ownerEmail: "asha@example.test" } });
  await prisma.business.create({ data: { id: NO_EMAIL, name: "No Email Kitchen" } });
});
afterEach(clean);

describe("templates", () => {
  it("render every template with a subject and escaped, branded html", () => {
    const vars = { daysLeft: 3, planName: "Pro", amount: 3540, invoiceNumber: "PL/1", validUntil: "5 Nov 2026" };
    for (const key of Object.keys(TEMPLATES)) {
      const out = renderTemplate(key, vars, ctx);
      expect(out.ok, key).toBe(true);
      if (out.ok) {
        expect(out.value.subject.length).toBeGreaterThan(5);
        expect(out.value.html).toContain("Team Platterly");
        expect(out.value.html).toContain("Asha's &lt;Kitchen&gt;");
        expect(out.value.html).not.toContain("<Kitchen>");
      }
    }
  });

  it("never lets a variable inject markup", () => {
    const out = renderTemplate("payment_failed", { planName: '<img src=x onerror="alert(1)">' }, ctx);
    expect(out.ok && out.value.html).not.toContain("<img src=x");
    expect(out.ok && out.value.html).toContain("&lt;img src=x");
  });

  it("refuses an unknown template, inherited names, a missing variable and a non-number day count", () => {
    expect(renderTemplate("nope", {}, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("unknown template") });
    expect(renderTemplate("constructor", {}, ctx).ok).toBe(false);
    expect(renderTemplate("trial_ending", {}, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("daysLeft") });
    expect(renderTemplate("trial_ending", { daysLeft: "soon" }, ctx).ok).toBe(false);
  });

  it("talks about one day, not 1 days", () => {
    const out = renderTemplate("trial_ending", { daysLeft: 1 }, ctx);
    expect(out.ok && out.value.subject).toBe("Your Platterly trial ends in 1 day");
  });
});

describe("sendMessage", () => {
  it("sends the rendered email to the owner and logs it as sent", async () => {
    const result = await sendMessage({ businessId: BIZ, productKey: KEY, template: "payment_failed", variables: { planName: "Pro" } }, fakeFetch);
    expect(result).toMatchObject({ ok: true, outcome: "sent" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.to[0].email_address.address).toBe("asha@example.test");
    expect(calls[0].body.subject).toBe("Your Platterly payment did not go through");
    expect(calls[0].body.htmlbody).toContain("https://catering.example/subscribe");
    expect(await prisma.messageLog.findFirstOrThrow({ where: { businessId: BIZ } })).toMatchObject({ status: "SENT", toEmail: "asha@example.test", providerMessage: "req-1", attempts: 1 });
  });

  it("logs a skip, and sends nothing, when no mail provider is set", async () => {
    delete process.env.ZEPTOMAIL_TOKEN;
    expect(await sendMessage({ businessId: BIZ, productKey: KEY, template: "welcome_owner" }, fakeFetch)).toMatchObject({ ok: true, outcome: "skipped" });
    expect(calls).toHaveLength(0);
    expect(await prisma.messageLog.findFirstOrThrow({ where: { businessId: BIZ } })).toMatchObject({ status: "SKIPPED", error: "ZeptoMail is not configured." });
  });

  it("skips a business with no owner email", async () => {
    expect(await sendMessage({ businessId: NO_EMAIL, productKey: KEY, template: "welcome_owner" }, fakeFetch)).toMatchObject({ outcome: "skipped" });
    expect(calls).toHaveLength(0);
    expect((await prisma.messageLog.findFirstOrThrow({ where: { businessId: NO_EMAIL } })).error).toMatch(/no owner email/);
  });

  it("refuses an unknown template or a missing variable before writing anything", async () => {
    expect(await sendMessage({ businessId: BIZ, productKey: KEY, template: "nope" }, fakeFetch)).toMatchObject({ ok: false });
    expect(await sendMessage({ businessId: BIZ, productKey: KEY, template: "trial_ending" }, fakeFetch)).toMatchObject({ ok: false });
    expect(await prisma.messageLog.count({ where: { businessId: BIZ } })).toBe(0);
  });

  it("sends the same dedupe key once", async () => {
    const input = { businessId: BIZ, productKey: KEY, template: "trial_ended", dedupeKey: "trial:s1:ended" };
    expect(await sendMessage(input, fakeFetch)).toMatchObject({ outcome: "sent" });
    expect(await sendMessage(input, fakeFetch)).toMatchObject({ outcome: "duplicate", id: null });
    expect(calls).toHaveLength(1);
  });

  it("retries a provider error on the 1m, 5m, 30m, 2h, 12h schedule, then gives up", async () => {
    answer = { status: 500, body: { message: "down" } };
    const sent = await sendMessage({ businessId: BIZ, productKey: KEY, template: "trial_ended" }, fakeFetch);
    const id = (sent as { id: string }).id;
    let now = new Date();
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const row = await prisma.messageLog.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: "PENDING", attempts: attempt });
      expect(Math.abs(row.nextAttemptAt!.getTime() - (attempt === 1 ? Date.now() : now.getTime()) - RETRY_DELAYS_SECONDS[attempt - 1] * 1000)).toBeLessThan(5000);
      now = new Date(row.nextAttemptAt!.getTime() + 1000);
      expect(await attemptMessage(id, now, fakeFetch)).toBe(attempt + 1 < MAX_ATTEMPTS ? "retry" : "failed");
    }
    expect(await prisma.messageLog.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, error: expect.stringContaining("500") });
  });

  it("a retry that succeeds ends the message, and the scheduled job picks up only what is due", async () => {
    answer = { status: 500, body: {} };
    const { id } = (await sendMessage({ businessId: BIZ, productKey: KEY, template: "trial_ended" }, fakeFetch)) as { id: string };
    expect(await runDueMessages(new Date())).toBe(0);
    answer = { status: 200, body: { request_id: "req-2" } };
    expect(await attemptMessage(id, new Date(Date.now() + 120_000), fakeFetch)).toBe("sent");
    expect(await prisma.messageLog.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SENT", providerMessage: "req-2", attempts: 2 });
  });
});

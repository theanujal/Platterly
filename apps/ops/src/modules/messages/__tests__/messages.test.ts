import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, attemptMessage, runDueMessages, sendMessage } from "../messages";
import { TEMPLATES, renderTemplate, whatsappMessage } from "../templates";

const KEY = "msgtest";
const BIZ = `biz_${"9".repeat(32)}`;
const NO_EMAIL = `biz_${"8".repeat(32)}`;
const saved = { token: process.env.ZEPTOMAIL_TOKEN, from: process.env.ZEPTOMAIL_FROM };
const WACRM_ENV = ["WACRM_BASE_URL", "WACRM_API_KEY", "WACRM_TEST_TO", "WACRM_TEMPLATES_APPROVED"] as const;
const savedWacrm = Object.fromEntries(WACRM_ENV.map((k) => [k, process.env[k]]));
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
  for (const k of WACRM_ENV) {
    if (savedWacrm[k] === undefined) delete process.env[k];
    else process.env[k] = savedWacrm[k];
  }
});
beforeEach(async () => {
  await clean();
  calls = [];
  answer = { status: 200, body: { request_id: "req-1" } };
  process.env.ZEPTOMAIL_TOKEN = "test-token";
  process.env.ZEPTOMAIL_FROM = "noreply@example.test";
  await prisma.product.create({ data: { key: KEY, name: "Catering", baseUrl: "https://catering.example", outboundSecret: "x", inboundSecret: "x" } });
  await prisma.business.create({ data: { id: BIZ, name: "Asha's Kitchen", ownerName: "Asha", ownerEmail: "asha@example.test", ownerPhone: "+919812345678" } });
  await prisma.business.create({ data: { id: NO_EMAIL, name: "No Email Kitchen" } });
});
afterEach(async () => {
  delete process.env.WACRM_ALLOW_IN_TESTS;
  await clean();
});

describe("templates", () => {
  it("render every template with a subject and escaped, branded html", () => {
    const vars = { daysLeft: 3, planName: "Pro", amount: 3540, invoiceNumber: "PL/1", validUntil: "5 Nov 2026", quantity: 2, trackingNote: "Courier ABC 123", endsOn: "8 Nov 2026", newPlanName: "Lite", chargeOn: "22 Nov 2026" };
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

  it("the grace email says Resume for a paused subscription, and Renew otherwise", () => {
    const paused = renderTemplate("plan_grace", { daysLeft: 3, endsOn: "8 Nov 2026", paused: 1 }, ctx);
    const plain = renderTemplate("plan_grace", { daysLeft: 3, endsOn: "8 Nov 2026" }, ctx);
    expect(paused.ok && paused.value.html).toContain("Resume");
    expect(paused.ok && paused.value.subject).toContain("resume");
    expect(plain.ok && plain.value.html).toContain("Renew now");
    expect(plain.ok && plain.value.html).toContain("locked");
  });

  it("renders the auto-pay emails", () => {
    for (const key of ["autopay_failed", "autopay_stopped", "autopay_paused", "autopay_resumed"]) expect(renderTemplate(key, { planName: "Pro" }, ctx).ok).toBe(true);
    expect(renderTemplate("downgrade_approval", { planName: "Pro", newPlanName: "Lite" }, ctx).ok).toBe(true);
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

  it("the renewal email says today, tomorrow or in n days, for monthly and yearly plans", () => {
    const today = renderTemplate("plan_renewal_due", { daysLeft: 0, endsOn: "22 Nov 2026", planName: "Pro" }, ctx);
    const week = renderTemplate("plan_renewal_due", { daysLeft: 6, endsOn: "22 Nov 2026", planName: "Pro" }, ctx);
    expect(today.ok && today.value.subject).toBe("Your Platterly plan renews today");
    expect(week.ok && week.value.subject).toBe("Your Platterly plan ends in 6 days");
    expect(week.ok && week.value.html).not.toContain("yearly");
    expect(renderTemplate("plan_renewal_due", { daysLeft: 6, endsOn: "22 Nov 2026" }, ctx).ok).toBe(false);
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

describe("WhatsApp", () => {
  it("a template with a WhatsApp part writes an email row and a WhatsApp row; one without writes only the email", async () => {
    await sendMessage({ businessId: BIZ, productKey: KEY, template: "plan_locked", dedupeKey: "k1" }, fakeFetch);
    await sendMessage({ businessId: BIZ, productKey: KEY, template: "welcome_owner", dedupeKey: "k2" }, fakeFetch);
    const rows = await prisma.messageLog.findMany({ where: { productKey: KEY }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.template, r.channel, r.dedupeKey])).toEqual([["plan_locked", "EMAIL", "k1"], ["plan_locked", "WHATSAPP", "wa:k1"], ["welcome_owner", "EMAIL", "k2"]]);
  });

  it("emailOnly skips the WhatsApp row", async () => {
    await sendMessage({ businessId: BIZ, productKey: KEY, template: "plan_locked", dedupeKey: "k3", emailOnly: true }, fakeFetch);
    expect(await prisma.messageLog.count({ where: { productKey: KEY, channel: "WHATSAPP" } })).toBe(0);
  });

  it("is skipped, never retried, without a phone or while Wacrm is not set up; the email still goes", async () => {
    await sendMessage({ businessId: NO_EMAIL, productKey: KEY, template: "plan_locked" }, fakeFetch);
    expect((await prisma.messageLog.findFirstOrThrow({ where: { businessId: NO_EMAIL, channel: "WHATSAPP" } })).status).toBe("SKIPPED");
    await sendMessage({ businessId: BIZ, productKey: KEY, template: "plan_locked" }, fakeFetch);
    const wa = await prisma.messageLog.findFirstOrThrow({ where: { businessId: BIZ, channel: "WHATSAPP" } });
    expect([wa.status, wa.error]).toEqual(["SKIPPED", "WhatsApp is not set up."]);
    expect((await prisma.messageLog.findFirstOrThrow({ where: { businessId: BIZ, channel: "EMAIL" } })).status).toBe("SENT");
  });

  it("builds each Meta template's parameters, in order, with the right link", () => {
    expect(whatsappMessage("payment_received", { planName: "Pro", amount: 1180, invoiceNumber: "FPDK-26-11-1", validUntil: "22 Dec 2026" }, ctx)).toMatchObject({ name: "platterly_plan_payment_received", params: ["Asha's <Kitchen>", "₹1,180", "Pro", "22 Dec 2026", "FPDK-26-11-1"] });
    expect(whatsappMessage("plan_grace", { daysLeft: 3, endsOn: "29 Nov 2026", paused: 1 }, ctx)?.params).toEqual(["Asha's <Kitchen>", "29 Nov 2026", "https://catering.example/settings/subscription"]);
    expect(whatsappMessage("plan_grace", { daysLeft: 3, endsOn: "29 Nov 2026" }, ctx)?.params[2]).toBe("https://catering.example/subscribe");
    expect(whatsappMessage("autopay_failed", { planName: "Pro" }, ctx)?.text).toBe("Hi Asha's <Kitchen>, we could not take the auto-pay for your Pro plan. Razorpay will try again over the next few days, and everything keeps working meanwhile. To fix it now, set up auto-pay again here: https://catering.example/subscribe Thank you.");
    expect(whatsappMessage("plan_locked", {}, ctx)?.params).toEqual(["Asha's <Kitchen>", "https://catering.example/subscribe"]);
    expect(whatsappMessage("welcome_owner", {}, ctx)).toBeNull();
  });

  it("sends as the approved template, to the test number, and retries a failure like email", async () => {
    process.env.WACRM_BASE_URL = "https://wacrm.example";
    process.env.WACRM_API_KEY = "k";
    process.env.WACRM_TEST_TO = "+910000000000";
    process.env.WACRM_TEMPLATES_APPROVED = "platterly_plan_locked";
    process.env.WACRM_ALLOW_IN_TESTS = "1";
    const waCalls: { url: string; body: Record<string, unknown> }[] = [];
    let waStatus = 500;
    const both = (async (url: string, init: { body: string }) => {
      if (!url.startsWith("https://wacrm.example")) return fakeFetch(url, init as never);
      waCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(waStatus === 200 ? { data: { whatsapp_message_id: "wamid.1" } } : { error: "down" }), { status: waStatus });
    }) as unknown as typeof fetch;
    await sendMessage({ businessId: BIZ, productKey: KEY, template: "plan_locked", dedupeKey: "k9" }, both);
    const wa = await prisma.messageLog.findFirstOrThrow({ where: { dedupeKey: "wa:k9" } });
    expect([wa.status, wa.attempts, wa.nextAttemptAt !== null]).toEqual(["PENDING", 1, true]);
    expect(waCalls[0].body).toMatchObject({ to: "+910000000000", type: "template", template: { name: "platterly_plan_locked", params: ["Asha's Kitchen", "https://catering.example/subscribe"] } });
    waStatus = 200;
    expect(await attemptMessage(wa.id, new Date(Date.now() + RETRY_DELAYS_SECONDS[0] * 1000 + 1000), both)).toBe("sent");
    expect((await prisma.messageLog.findUniqueOrThrow({ where: { id: wa.id } })).toPhone).toBe("+910000000000");
  });
});

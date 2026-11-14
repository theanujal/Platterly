import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { fetchBillingPdf, loadPlanBilling } from "../plan-billing";

/** The read-only Subscription page's data: signed GETs to Ops, answers checked, nothing changed. Ops here is a stand-in that signs its answers. */
const COMMAND_SECRET = "opssec_planbilling_command";
const saved: Record<string, string | undefined> = {};
const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
let orgId = "";
let businessId = "";
let requests: { method: string; url: string }[] = [];
let answers: Record<string, { status: number; body: unknown }> = {};
let unsigned = false;

const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  requests.push({ method: init?.method ?? "GET", url });
  const key = Object.keys(answers).find((k) => url.includes(k));
  const answer = key ? answers[key] : { status: 500, body: { error: "unexpected" } };
  const text = JSON.stringify(answer.body);
  return new Response(text, { status: answer.status, headers: unsigned ? { "content-type": "application/json" } : signedHeaders(COMMAND_SECRET, newId("command"), text) });
}) as typeof fetch;

beforeAll(async () => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY", "OPS_BILLING"]) saved[k] = process.env[k];
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Plan Billing Kitchen", slug: `pb-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgId = org.id;
  businessId = org.businessId;
});
afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: orgId } });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  requests = [];
  answers = {};
  unsigned = false;
  process.env.OPS_BASE_URL = "http://ops.test";
  process.env.OPS_EVENT_SECRET = "opssec_planbilling_event";
  process.env.OPS_COMMAND_SECRETS = COMMAND_SECRET;
  process.env.OPS_PRODUCT_KEY = "catering";
  process.env.OPS_BILLING = "1";
});
afterEach(() => undefined);

describe("loadPlanBilling", () => {
  it("is 'off' with OPS_BILLING off and never calls Ops", async () => {
    delete process.env.OPS_BILLING;
    expect(await loadPlanBilling(orgId, fake)).toEqual({ state: "off" });
    expect(requests).toHaveLength(0);
  });

  it("reads the business's billing and the plan list with signed GETs", async () => {
    const view = { onlineBillingAvailable: true, subscription: null, history: [], payments: [] };
    answers = { [`/businesses/${businessId}/billing`]: { status: 200, body: view }, "/billing/plans": { status: 200, body: { plans: [{ id: "p1", name: "Pro" }] } } };
    const page = await loadPlanBilling(orgId, fake);
    expect(page).toEqual({ state: "ok", view, plans: [{ id: "p1", name: "Pro" }] });
    expect(requests.every((r) => r.method === "GET")).toBe(true);
    expect(requests.map((r) => r.url).sort()).toEqual([`http://ops.test/api/products/catering/billing/plans`, `http://ops.test/api/products/catering/businesses/${businessId}/billing`].sort());
  });

  it("still shows the subscription when the plan list fails, and says unavailable when Ops fails or is not who it says", async () => {
    const view = { onlineBillingAvailable: true, subscription: null, history: [], payments: [] };
    answers = { [`/businesses/${businessId}/billing`]: { status: 200, body: view }, "/billing/plans": { status: 500, body: {} } };
    expect(await loadPlanBilling(orgId, fake)).toEqual({ state: "ok", view, plans: [] });
    answers = { [`/businesses/${businessId}/billing`]: { status: 500, body: {} }, "/billing/plans": { status: 200, body: { plans: [] } } };
    expect(await loadPlanBilling(orgId, fake)).toEqual({ state: "unavailable" });
    unsigned = true;
    answers = { [`/businesses/${businessId}/billing`]: { status: 200, body: view }, "/billing/plans": { status: 200, body: { plans: [] } } };
    expect(await loadPlanBilling(orgId, fake)).toEqual({ state: "unavailable" });
  });
});

describe("fetchBillingPdf", () => {
  it("asks for an invoice or a credit note by its own path and returns the verified PDF", async () => {
    answers = { "/pdf": { status: 200, body: { fileName: "FPA-26-11-1.pdf", pdfBase64: pdf } }, "/credit-note": { status: 200, body: { fileName: "FPCNA-26-11-1.pdf", pdfBase64: pdf } } };
    const invoice = await fetchBillingPdf("invoice", orgId, "pay_abc", fake);
    expect(invoice.ok && invoice.fileName).toBe("FPA-26-11-1.pdf");
    const note = await fetchBillingPdf("credit-note", orgId, "rf_abc", fake);
    expect(note.ok && note.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(requests.map((r) => r.url)).toEqual([`http://ops.test/api/products/catering/businesses/${businessId}/billing/payments/pay_abc/pdf`, `http://ops.test/api/products/catering/businesses/${businessId}/billing/refunds/rf_abc/credit-note`]);
  });

  it("another kitchen's id is not found; a file that is not a PDF, or an unsafe name, is unavailable; a bad id never reaches Ops", async () => {
    answers = { "/pdf": { status: 404, body: { error: "unknown_invoice" } } };
    expect(await fetchBillingPdf("invoice", orgId, "pay_other", fake)).toEqual({ ok: false, reason: "not_found" });
    answers = { "/pdf": { status: 200, body: { fileName: "a.pdf", pdfBase64: Buffer.from("<html>").toString("base64") } } };
    expect(await fetchBillingPdf("invoice", orgId, "pay_abc", fake)).toEqual({ ok: false, reason: "unavailable" });
    answers = { "/pdf": { status: 200, body: { fileName: "../../etc/passwd", pdfBase64: pdf } } };
    expect(await fetchBillingPdf("invoice", orgId, "pay_abc", fake)).toEqual({ ok: false, reason: "unavailable" });
    requests = [];
    expect(await fetchBillingPdf("invoice", orgId, "../x", fake)).toEqual({ ok: false, reason: "not_found" });
    expect(requests).toHaveLength(0);
  });
});

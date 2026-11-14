import { describe, expect, it } from "vitest";
import { PLATFORM_PLANS_PATH, platformBillingPath, signedHeaders, verifyRequest, requestTarget, type PlatformBusinessBilling, type PlatformPlanCatalogue } from "@platterly/contract";
import { fetchOpsBilling, fetchOpsCatalogue, fetchOpsCreditNote, fetchOpsInvoice, opsCatalogueConfigured } from "../ops-catalogue";

const SECRET = "test-reader-secret-0123456789abcdef0123456789abcdef";
const env = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_READER_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const price = (amount: number) => ({ amount, gstPercent: 18, gstAmount: amount * 0.18, total: amount * 1.18 });
const catalogue: PlatformPlanCatalogue = {
  generatedAt: "2026-11-07T10:00:00.000Z",
  products: [{ productKey: "caterly", name: "Caterly", plans: [{ id: "p1", code: "STARTER", name: "Starter", description: null, highlights: ["a"], monthly: price(1000), annual: null }] }],
};

/** An Ops stand-in: checks the request signature like Ops does, then answers signed with the id of the request it verified. */
function ops(opts: { body?: unknown; tamper?: boolean; wrongId?: boolean; status?: number } = {}) {
  const seen: { method?: string; url?: string; signedOk?: boolean } = {};
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const verified = verifyRequest([SECRET], headers, "", { target: requestTarget("GET", url) });
    Object.assign(seen, { method: init?.method, url, signedOk: verified.ok });
    if (!verified.ok) return new Response("{}", { status: 401 });
    if (opts.status) return new Response("{}", { status: opts.status });
    const text = JSON.stringify(opts.body ?? catalogue);
    const answerHeaders = signedHeaders(SECRET, opts.wrongId ? "someone-elses-request-id" : verified.id, text);
    return new Response(opts.tamper ? text.replace("Caterly", "Caterlx") : text, { headers: answerHeaders });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe("Store: plans from Ops", () => {
  it("is configured only when both the address and the secret are set", () => {
    expect(opsCatalogueConfigured(env)).toBe(true);
    expect(opsCatalogueConfigured({ OPS_BASE_URL: "http://x" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(opsCatalogueConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("sends one signed, route-bound GET and returns the verified catalogue", async () => {
    const { fetchImpl, seen } = ops();
    const result = await fetchOpsCatalogue({ env, fetchImpl });
    expect(result).toEqual({ ok: true, catalogue });
    expect(seen.method).toBe("GET");
    expect(seen.url).toBe(`http://ops.test${PLATFORM_PLANS_PATH}`);
    expect(seen.signedOk).toBe(true);
  });

  it("does nothing without configuration", async () => {
    expect(await fetchOpsCatalogue({ env: {} as unknown as NodeJS.ProcessEnv })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("reports unreachable, refused, tampered, wrong-id and malformed answers as plain reasons", async () => {
    expect(await fetchOpsCatalogue({ env, fetchImpl: (async () => { throw new Error("down"); }) as typeof fetch })).toEqual({ ok: false, reason: "unreachable" });
    expect(await fetchOpsCatalogue({ env, fetchImpl: ops({ status: 401 }).fetchImpl })).toEqual({ ok: false, reason: "refused" });
    expect(await fetchOpsCatalogue({ env, fetchImpl: ops({ tamper: true }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsCatalogue({ env, fetchImpl: ops({ wrongId: true }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsCatalogue({ env, fetchImpl: ops({ body: { generatedAt: "x", products: [] } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsCatalogue({ env, fetchImpl: ops({ body: { generatedAt: catalogue.generatedAt, products: [{ productKey: "caterly", name: "C", plans: [{ id: "p" }] }] } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("refuses an answer signed with a different secret", async () => {
    const other = (async () => {
      const text = JSON.stringify(catalogue);
      return new Response(text, { headers: signedHeaders("a-different-secret-0123456789abcdef0123456789abcdef", "x", text) });
    }) as typeof fetch;
    expect(await fetchOpsCatalogue({ env, fetchImpl: other })).toEqual({ ok: false, reason: "bad_answer" });
  });
});

describe("Store: one business's billing from Ops", () => {
  const BIZ = `biz_${"a".repeat(32)}`;
  const OTHER = `biz_${"b".repeat(32)}`;
  const billing = (businessId: string): PlatformBusinessBilling => ({
    businessId,
    generatedAt: "2026-11-07T10:00:00.000Z",
    products: [{
      productKey: "caterly",
      name: "Caterly",
      billing: {
        onlineBillingAvailable: true,
        subscription: { id: "sub_1", status: "ACTIVE", plan: { id: "p1", code: "GROWTH", name: "Growth" }, billingInterval: "MONTHLY", startDate: "2026-10-01T00:00:00.000Z", trialEndsAt: null, currentPeriodEnd: "2026-12-01T00:00:00.000Z", pending: null, autoPay: null },
        history: [{ id: "sub_1", planName: "Growth", status: "ACTIVE", startDate: "2026-10-01T00:00:00.000Z", endDate: null }],
        payments: [{ id: "pay_1", planName: "Growth", interval: "MONTHLY", total: 2950, paidAt: "2026-11-01T00:00:00.000Z", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", invoiceNumber: "INV-1" }],
      },
    }],
  });
  const answer = (body: unknown, status = 200) => (async (input: URL | string, init?: RequestInit) => {
    const verified = verifyRequest([SECRET], new Headers(init?.headers), "", { target: requestTarget("GET", String(input)) });
    if (!verified.ok) return new Response("{}", { status: 401 });
    const text = JSON.stringify(body);
    return new Response(text, { status, headers: signedHeaders(SECRET, verified.id, text) });
  }) as typeof fetch;

  it("asks for the business in the signed path and returns the verified answer", async () => {
    let asked = "";
    const fetchImpl = (async (input: URL | string, init?: RequestInit) => { asked = String(input); return answer(billing(BIZ))(input, init); }) as typeof fetch;
    const result = await fetchOpsBilling(BIZ, { env, fetchImpl });
    expect(asked).toBe(`http://ops.test${platformBillingPath(BIZ)}`);
    expect(result).toEqual({ ok: true, billing: billing(BIZ) });
  });

  it("refuses an answer that is for a different business than the one asked about", async () => {
    expect(await fetchOpsBilling(BIZ, { env, fetchImpl: answer(billing(OTHER)) })).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("reports an unknown business, a malformed answer, and a missing configuration plainly", async () => {
    expect(await fetchOpsBilling(BIZ, { env, fetchImpl: answer({ error: "not_found" }, 404) })).toEqual({ ok: false, reason: "not_found" });
    expect(await fetchOpsBilling(BIZ, { env, fetchImpl: answer({ businessId: BIZ, generatedAt: "2026-11-07T10:00:00.000Z", products: [{ productKey: "caterly", name: "C", billing: { onlineBillingAvailable: true, subscription: null, history: [{}], payments: [] } }] }) })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsBilling(BIZ, { env: {} as unknown as NodeJS.ProcessEnv })).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("Store: an invoice PDF from Ops", () => {
  const pdf = Buffer.from("%PDF-1.3\nfake").toString("base64");
  const BIZ = `biz_${"a".repeat(32)}`;

  it("asks for one payment of one business and product, and returns the verified PDF", async () => {
    const { fetchImpl, seen } = ops({ body: { fileName: "FPA-26-11-269.pdf", pdfBase64: pdf } });
    const result = await fetchOpsInvoice(BIZ, "catering", "pay_abc", { env, fetchImpl });
    expect(result.ok && result.fileName).toBe("FPA-26-11-269.pdf");
    expect(result.ok && result.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(seen.url).toBe(`http://ops.test/api/platform/businesses/${BIZ}/products/catering/billing/payments/pay_abc/invoice`);
    expect(seen.signedOk).toBe(true);
  });

  it("refuses an answer that is not a PDF, has an unsafe file name, or is unsigned, tampered or for another request", async () => {
    const notPdf = Buffer.from("<html>hi</html>").toString("base64");
    expect(await fetchOpsInvoice(BIZ, "catering", "pay_abc", { env, fetchImpl: ops({ body: { fileName: "a.pdf", pdfBase64: notPdf } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsInvoice(BIZ, "catering", "pay_abc", { env, fetchImpl: ops({ body: { fileName: "../../etc/passwd", pdfBase64: pdf } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsInvoice(BIZ, "catering", "pay_abc", { env, fetchImpl: ops({ body: { fileName: "Caterly.pdf", pdfBase64: pdf }, tamper: true }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await fetchOpsInvoice(BIZ, "catering", "pay_abc", { env, fetchImpl: ops({ body: { fileName: "a.pdf", pdfBase64: pdf }, wrongId: true }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("a payment Ops does not know for that business is not_found", async () => {
    expect(await fetchOpsInvoice(BIZ, "catering", "pay_other", { env, fetchImpl: ops({ status: 404 }).fetchImpl })).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("fetchOpsCreditNote", () => {
  const BIZ = `biz_${"a".repeat(32)}`;
  const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
  it("asks for one refund of one business and product, and returns the verified PDF; a refund Ops does not know is not_found", async () => {
    const { fetchImpl, seen } = ops({ body: { fileName: "FPCNA-26-11-1.pdf", pdfBase64: pdf } });
    const result = await fetchOpsCreditNote(BIZ, "catering", "rf_abc", { env, fetchImpl });
    expect(result.ok && result.fileName).toBe("FPCNA-26-11-1.pdf");
    expect(seen.url).toBe(`http://ops.test/api/platform/businesses/${BIZ}/products/catering/billing/refunds/rf_abc/credit-note`);
    expect(seen.signedOk).toBe(true);
    expect(await fetchOpsCreditNote(BIZ, "catering", "rf_other", { env, fetchImpl: ops({ status: 404 }).fetchImpl })).toEqual({ ok: false, reason: "not_found" });
    expect(await fetchOpsCreditNote(BIZ, "catering", "rf_abc", { env, fetchImpl: ops({ body: { fileName: "a.pdf", pdfBase64: Buffer.from("x").toString("base64") } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
  });
});

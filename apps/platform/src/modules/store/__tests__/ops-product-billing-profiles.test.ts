import { describe, expect, it } from "vitest";
import { platformProductBillingProfilePath, platformProductBillingProfilesPath, requestTarget, signedHeaders, verifyRequest, type ProductBillingProfileRecord, type ProductBillingProfileRequest } from "@platterly/contract";
import { fetchOpsProductBillingProfiles } from "../ops-catalogue";
import { saveOpsProductBillingProfile } from "../ops-checkout";

const READER = "reader-secret-0123456789abcdef0123456789abcdef";
const BILLING = "billing-secret-0123456789abcdef0123456789abcdef";
const BIZ = `biz_${"a".repeat(32)}`;
const readEnv = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_READER_SECRET: READER } as unknown as NodeJS.ProcessEnv;
const saveEnv = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_BILLING_SECRET: BILLING } as unknown as NodeJS.ProcessEnv;
const profile: ProductBillingProfileRecord = { businessPhone: null, orderNumberPrefix: null, orderNumberNextValue: null, orderNumberPadding: null, productKey: "caterly", version: 2, source: "product", updatedAt: "2026-11-16T10:00:00.000Z", name: "Spice Route", brandName: "Spice", contactName: "Asha", contactEmail: "a@example.com", contactPhone: "9876543210", addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: null, description: null, website: null, instagram: null, facebook: null, logoUrl: "https://caterly.example/logo.png" };
const { productKey: _k, version: _v, source: _s, updatedAt: _u, ...fields } = profile;
void _k; void _v; void _s; void _u;
const request: ProductBillingProfileRequest = { baseVersion: 2, source: "account", editedBy: "u1", fields };

function ops(secret: string, method: "GET" | "PUT", reply: { status?: number; body?: unknown } = {}) {
  const seen: { url?: string; body?: string; signedOk?: boolean } = {};
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const text = String(init?.body ?? "");
    const verified = verifyRequest([secret], new Headers(init?.headers), text, { target: requestTarget(method, url) });
    Object.assign(seen, { url, body: text, signedOk: verified.ok });
    if (!verified.ok) return new Response("{}", { status: 401 });
    const answer = JSON.stringify(reply.body);
    return new Response(answer, { status: reply.status ?? 200, headers: signedHeaders(secret, verified.id, answer) });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe("Store: per-product billing profiles over the signed Ops channel", () => {
  it("reads every profile with the read-only secret", async () => {
    const { fetchImpl, seen } = ops(READER, "GET", { body: { profiles: [profile] } });
    expect(await fetchOpsProductBillingProfiles(BIZ, { env: readEnv, fetchImpl })).toEqual({ ok: true, profiles: [profile] });
    expect(seen).toMatchObject({ url: `http://ops.test${platformProductBillingProfilesPath(BIZ)}`, signedOk: true });
    expect(await fetchOpsProductBillingProfiles(BIZ, { env: readEnv, fetchImpl: ops(READER, "GET", { body: { profiles: [{ ...profile, version: 0 }] } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("saves with the billing secret to the product's route and returns the saved record", async () => {
    const { fetchImpl, seen } = ops(BILLING, "PUT", { body: { profile: { ...profile, version: 3 } } });
    const got = await saveOpsProductBillingProfile({ businessId: BIZ, productKey: "caterly", request }, { env: saveEnv, fetchImpl });
    expect(got).toEqual({ ok: true, answer: { profile: { ...profile, version: 3 } } });
    expect(seen).toMatchObject({ url: `http://ops.test${platformProductBillingProfilePath(BIZ, "caterly")}`, signedOk: true });
    expect(JSON.parse(seen.body!)).toMatchObject({ baseVersion: 2, editedBy: "u1" });
  });

  it("turns a stale save (409) into a conflict that carries the current record", async () => {
    const stale = ops(BILLING, "PUT", { status: 409, body: { error: "conflict", current: { ...profile, version: 5, city: "Mumbai" } } });
    const got = await saveOpsProductBillingProfile({ businessId: BIZ, productKey: "caterly", request }, { env: saveEnv, fetchImpl: stale.fetchImpl });
    expect(got).toEqual({ ok: true, answer: { conflict: true, current: { ...profile, version: 5, city: "Mumbai" } } });
    const gone = ops(BILLING, "PUT", { status: 409, body: { error: "conflict", current: null } });
    expect(await saveOpsProductBillingProfile({ businessId: BIZ, productKey: "caterly", request }, { env: saveEnv, fetchImpl: gone.fetchImpl })).toEqual({ ok: true, answer: { conflict: true, current: null } });
  });

  it("reports a rejection, a malformed conflict and missing configuration as plain reasons", async () => {
    expect(await saveOpsProductBillingProfile({ businessId: BIZ, productKey: "caterly", request }, { env: saveEnv, fetchImpl: ops(BILLING, "PUT", { status: 400, body: { error: "fields.gstin: bad" } }).fetchImpl })).toEqual({ ok: false, reason: "rejected", message: "fields.gstin: bad" });
    expect(await saveOpsProductBillingProfile({ businessId: BIZ, productKey: "caterly", request }, { env: saveEnv, fetchImpl: ops(BILLING, "PUT", { status: 409, body: { error: "conflict" } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    expect(await saveOpsProductBillingProfile({ businessId: BIZ, productKey: "caterly", request }, { env: {} as unknown as NodeJS.ProcessEnv })).toEqual({ ok: false, reason: "not_configured" });
  });
});

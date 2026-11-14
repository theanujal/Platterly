import { describe, expect, it } from "vitest";
import { platformBillingProfilePath, requestTarget, signedHeaders, verifyRequest, type Buyer } from "@platterly/contract";
import { fetchOpsBillingProfile } from "../ops-catalogue";
import { saveOpsBillingProfile } from "../ops-checkout";

const READER = "reader-secret-0123456789abcdef0123456789abcdef";
const BILLING = "billing-secret-0123456789abcdef0123456789abcdef";
const BIZ = `biz_${"a".repeat(32)}`;
const readEnv = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_READER_SECRET: READER } as unknown as NodeJS.ProcessEnv;
const saveEnv = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_BILLING_SECRET: BILLING } as unknown as NodeJS.ProcessEnv;
const buyer: Buyer = { name: "Spice Route", addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: null, gstin: null };
const saved = { profile: buyer, updatedAt: "2026-11-14T10:00:00.000Z" };

/** An Ops stand-in that checks the request like Ops does, then answers signed with the request's id. */
function ops(secret: string, method: "GET" | "PUT", reply: { status?: number; body?: unknown; tamper?: boolean; throws?: boolean } = {}) {
  const seen: { method?: string; url?: string; body?: string; signedOk?: boolean } = {};
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    if (reply.throws) throw new Error("down");
    const url = String(input);
    const text = String(init?.body ?? "");
    const verified = verifyRequest([secret], new Headers(init?.headers), text, { target: requestTarget(method, url) });
    Object.assign(seen, { method: init?.method, url, body: text, signedOk: verified.ok });
    if (!verified.ok) return new Response("{}", { status: 401 });
    const answer = JSON.stringify(reply.body ?? saved);
    return new Response(reply.tamper ? answer.replace("Pune", "Goa") : answer, { status: reply.status ?? 200, headers: signedHeaders(secret, verified.id, answer) });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe("Store: reading a business's saved billing details from Ops", () => {
  const read = (fetchImpl: typeof fetch, env = readEnv) => fetchOpsBillingProfile(BIZ, { env, fetchImpl });

  it("sends one signed GET to the business's own route with the read-only secret and returns the verified details", async () => {
    const { fetchImpl, seen } = ops(READER, "GET");
    expect(await read(fetchImpl)).toEqual({ ok: true, answer: saved });
    expect(seen).toMatchObject({ method: "GET", url: `http://ops.test${platformBillingProfilePath(BIZ)}`, signedOk: true });
  });

  it("returns the empty answer for a business with nothing saved", async () => {
    expect(await read(ops(READER, "GET", { body: { profile: null, updatedAt: null } }).fetchImpl)).toEqual({ ok: true, answer: { profile: null, updatedAt: null } });
  });

  it("reports an unknown business, a refusal, an unreachable Ops, a tampered or malformed answer, and missing configuration as plain reasons", async () => {
    expect(await read(ops(READER, "GET", { status: 404 }).fetchImpl)).toEqual({ ok: false, reason: "not_found" });
    expect(await read(ops(READER, "GET", { status: 500 }).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await read(ops(READER, "GET", { throws: true }).fetchImpl)).toEqual({ ok: false, reason: "unreachable" });
    expect(await read(ops(READER, "GET", { tamper: true }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
    expect(await read(ops(READER, "GET", { body: { profile: "x", updatedAt: null } }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
    expect(await read(ops(READER, "GET").fetchImpl, {} as unknown as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: "not_configured" });
  });
});

describe("Store: saving a business's billing details through Ops", () => {
  const save = (fetchImpl: typeof fetch, env = saveEnv) => saveOpsBillingProfile({ businessId: BIZ, buyer, editedBy: "user-1" }, { env, fetchImpl });

  it("sends one signed PUT to the business's own route with the billing secret and returns Ops's verified record", async () => {
    const { fetchImpl, seen } = ops(BILLING, "PUT");
    expect(await save(fetchImpl)).toEqual({ ok: true, answer: saved });
    expect(seen).toMatchObject({ method: "PUT", url: `http://ops.test${platformBillingProfilePath(BIZ)}`, signedOk: true });
    expect(JSON.parse(seen.body!)).toEqual({ buyer, editedBy: "user-1" });
  });

  it("does nothing without the billing secret: the read-only secret cannot save", async () => {
    const { fetchImpl, seen } = ops(BILLING, "PUT");
    expect(await save(fetchImpl, {} as unknown as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: "not_configured" });
    expect(await save(fetchImpl, readEnv)).toEqual({ ok: false, reason: "not_configured" });
    expect(seen.method).toBeUndefined();
  });

  it("passes on Ops's own message when it refuses the details, and reports the other failures as plain reasons", async () => {
    expect(await save(ops(BILLING, "PUT", { status: 400, body: { error: "buyer.gstin: Enter a valid 15-character GSTIN, or leave it blank." } }).fetchImpl)).toEqual({ ok: false, reason: "rejected", message: "buyer.gstin: Enter a valid 15-character GSTIN, or leave it blank." });
    expect(await save(ops(BILLING, "PUT", { status: 404, body: { error: "unknown_business" } }).fetchImpl)).toEqual({ ok: false, reason: "unknown_business" });
    expect(await save(ops(BILLING, "PUT", { throws: true }).fetchImpl)).toEqual({ ok: false, reason: "unreachable" });
    expect(await save(ops(BILLING, "PUT", { tamper: true }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
    expect(await save(ops(BILLING, "PUT", { body: { nonsense: true } }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
  });
});

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { fetchProductReport, reportsOf } from "../product-reports";

const KEY = "reptest";
let server: Server;
let baseUrl = "";
let outboundSecret = "";
let inboundSecret = "";
let seen: { path: string; verified: boolean }[] = [];
let answer: { status: number; body: string; sign: boolean } = { status: 200, body: "", sign: true };

const doc = { report: "sales", title: "Sales", period: { from: null, to: null }, blocks: [{ type: "tiles", tiles: [{ label: "Revenue", value: "₹1" }] }] };

async function clean() {
  await prisma.product.deleteMany({ where: { key: KEY } });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ path: req.url!, verified: verifyRequest([outboundSecret], new Headers(req.headers as Record<string, string>), "").ok });
    res.writeHead(answer.status, answer.sign ? signedHeaders(inboundSecret, newId("command"), answer.body) : {});
    res.end(answer.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await clean();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(async () => {
  await clean();
  seen = [];
  answer = { status: 200, body: JSON.stringify(doc), sign: true };
  const { secrets } = await registerProduct({ key: KEY, name: "Rep Test", baseUrl, actorUserId: null });
  outboundSecret = secrets.outbound;
  inboundSecret = secrets.inbound;
  const manifest = { contract: 1, productKey: KEY, name: "Rep Test", version: "1", baseUrl, entitlements: [], trial: { days: 7, entitlements: {} }, events: [], messageTemplates: [], tabs: [], actions: [], reports: [{ key: "sales", label: "Sales" }] };
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
});
afterEach(clean);

describe("fetching a product's report", () => {
  it("asks with a signed GET carrying the range, and returns the validated document", async () => {
    const result = await fetchProductReport(KEY, "sales", { from: "2026-10-01", to: "2026-10-31" });
    expect(result).toEqual({ ok: true, doc });
    expect(seen).toEqual([{ path: "/api/ops/reports/sales?from=2026-10-01&to=2026-10-31", verified: true }]);
    await fetchProductReport(KEY, "sales", { from: null, to: null });
    expect(seen[1].path).toBe("/api/ops/reports/sales");
  });

  it("refuses a report the manifest does not list, without calling the product", async () => {
    expect(await fetchProductReport(KEY, "payroll", { from: null, to: null })).toMatchObject({ ok: false, error: expect.stringContaining("does not publish") });
    expect(seen).toHaveLength(0);
  });

  it("does not trust an unsigned answer, an error status, a non-document or the wrong report", async () => {
    answer = { status: 200, body: JSON.stringify(doc), sign: false };
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toMatchObject({ ok: false, error: expect.stringContaining("not signed correctly") });
    answer = { status: 500, body: "{}", sign: true };
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toEqual({ ok: false, error: "The product answered 500." });
    answer = { status: 200, body: "not json", sign: true };
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toMatchObject({ ok: false, error: "The report was not JSON." });
    answer = { status: 200, body: JSON.stringify({ ...doc, blocks: [{ type: "script" }] }), sign: true };
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toMatchObject({ ok: false, error: expect.stringContaining("The report is invalid") });
    answer = { status: 200, body: JSON.stringify({ ...doc, report: "events" }), sign: true };
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toMatchObject({ ok: false, error: expect.stringContaining('instead of "sales"') });
  });

  it("says so when the product is disabled or unreachable", async () => {
    await prisma.product.update({ where: { key: KEY }, data: { baseUrl: "http://127.0.0.1:9" } });
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
    await prisma.product.update({ where: { key: KEY }, data: { status: "DISABLED" } });
    expect(await fetchProductReport(KEY, "sales", { from: null, to: null })).toMatchObject({ ok: false, error: "This product is not active." });
    expect(await fetchProductReport("nosuch", "sales", { from: null, to: null })).toMatchObject({ ok: false });
  });

  it("reads the report list from a manifest, tolerating none", () => {
    expect(reportsOf({ reports: [{ key: "a", label: "A" }] })).toEqual([{ key: "a", label: "A" }]);
    expect(reportsOf(null)).toEqual([]);
    expect(reportsOf({})).toEqual([]);
  });
});
